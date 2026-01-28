import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { triageConversation, type TriageLevel } from "@/lib/triage";
import { validateResponse } from "@/lib/validators";
import { generateAssistantReply } from "@/lib/llm";
import { repairResponse, type Stage } from "@/lib/repair";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

const loadSystemPrompt = async () => {
  const promptPath = path.join(process.cwd(), "prompts", "system.md");
  try {
    return await fs.readFile(promptPath, "utf8");
  } catch {
    return "";
  }
};

const getNextStage = (stage: Stage) => {
  switch (stage) {
    case "greeting":
      return "clarify";
    case "clarify":
      return "concern";
    case "concern":
      return "recommendation";
    default:
      return "recommendation";
  }
};

const getEmergencyAction = (triageLevel: TriageLevel) => {
  if (triageLevel === "unclear") {
    return "Go to urgent care or an emergency department today.";
  }
  return "Call 911 now or go to the nearest emergency department.";
};

const detectSymptomLabel = (text: string) => {
  const hints: { keyword: RegExp; label: string }[] = [
    { keyword: /headache|head pain/i, label: "your headache" },
    { keyword: /fatigue|tired|exhausted/i, label: "your fatigue" },
    { keyword: /cough|cold|congestion|runny nose|sore throat/i, label: "your cold symptoms" },
    { keyword: /chest pain|chest pressure|chest tightness/i, label: "your chest discomfort" },
    {
      keyword: /trouble breathing|difficulty breathing|shortness of breath/i,
      label: "your breathing trouble",
    },
    { keyword: /dizzy|lightheaded/i, label: "your dizziness" },
    { keyword: /stomach|nausea|vomit/i, label: "your stomach symptoms" },
  ];

  for (const hint of hints) {
    if (hint.keyword.test(text)) {
      return hint.label;
    }
  }

  return "your symptoms";
};

const buildFeedback = (
  errors: string[],
  symptomContext: string,
  stage: Stage,
  triageLevel?: TriageLevel
) => {
  const symptomLabel = detectSymptomLabel(symptomContext);
  const fixes: string[] = [];
  const verbatim: string[] = [];

  for (const error of errors) {
    if (error.includes('Missing required acknowledgment phrase "I understand"')) {
      fixes.push('Include the exact phrase "I understand".');
      verbatim.push("I understand.");
    }
    if (error.includes("Missing required pain empathy phrase")) {
      fixes.push('Include the exact sentence "That sounds really uncomfortable."');
      verbatim.push("That sounds really uncomfortable.");
    }
    if (error.includes("Missing required worry empathy phrase")) {
      fixes.push(
        `Include the exact sentence "It's completely understandable that you're concerned about ${symptomLabel}."`
      );
      verbatim.push(`It's completely understandable that you're concerned about ${symptomLabel}.`);
    }
    if (error.includes("Worry empathy phrase must reference the specific symptom")) {
      fixes.push(
        `Reference the specific symptom in: "It's completely understandable that you're concerned about ${symptomLabel}."`
      );
      verbatim.push(`It's completely understandable that you're concerned about ${symptomLabel}.`);
    }
    if (error.includes("Missing exact timeline question")) {
      fixes.push(
        'Ask exactly: "When did this first start, and has it been getting better, worse, or staying the same?"'
      );
      verbatim.push(
        "When did this first start, and has it been getting better, worse, or staying the same?"
      );
    }
    if (error.includes('Missing exact "What concerns you most about this?" question')) {
      fixes.push('Ask exactly: "What concerns you most about this?"');
      verbatim.push("What concerns you most about this?");
    }
    if (error.includes("Missing in-person examination disclaimer")) {
      fixes.push(
        'Include: "I can provide guidance, but I cannot replace an in-person examination"'
      );
      verbatim.push("I can provide guidance, but I cannot replace an in-person examination");
    }
    if (error.includes("Missing exact follow-up timeframe sentence")) {
      fixes.push('Include: "If this isn\'t improving in 3 days, please contact..."');
      verbatim.push("If this isn't improving in 3 days, please contact a local clinic or urgent care.");
    }
    if (error.includes("Mild response must include exactly 3 numbered recommendations")) {
      fixes.push("Provide exactly 3 numbered recommendations (1-3).");
    }
    if (error.includes("Each numbered recommendation must end with the check-in phrase")) {
      fixes.push('End each numbered recommendation with "How does this sound to you?"');
    }
    if (error.includes("Emergency response must start with")) {
      fixes.push('Start with: "Based on what you\'ve told me..."');
      verbatim.push("Based on what you've told me");
    }
    if (error.includes("Emergency response must include")) {
      fixes.push('Include: "Here\'s what I recommend..."');
      verbatim.push("Here's what I recommend");
    }
    if (error.includes("Emergency response missing escalation safety phrase")) {
      fixes.push('Include: "This is beyond what I can safely assess remotely".');
      verbatim.push("This is beyond what I can safely assess remotely");
    }
    if (error.includes("Emergency response must end recommendation")) {
      fixes.push('End the recommendation with "How does this sound to you?"');
      verbatim.push("How does this sound to you?");
    }
    if (error.includes("Contains banned phrase")) {
      fixes.push('Remove banned phrases: "I see", "I hear", "don\'t worry".');
    }
    if (error.includes("Contains medical jargon")) {
      fixes.push("Remove medical jargon; use simple everyday words.");
    }
  }

  if (triageLevel === "mild") {
    fixes.push("Keep the response in the mild format with exactly 3 self-care items.");
  }
  if (triageLevel && triageLevel !== "mild") {
    fixes.push(
      "Keep the emergency format: Based on what you've told me... This is beyond what I can safely assess remotely... Here's what I recommend..."
    );
  }
  if (stage === "clarify" || stage === "concern") {
    fixes.push("Do not provide recommendations at this stage.");
  }

  if (stage !== "greeting") {
    verbatim.push("I understand.");
  }

  const verbatimUnique = [...new Set(verbatim)].join(" | ");
  const fixesText = fixes.join(" ");
  return [
    fixesText,
    verbatimUnique ? `You MUST include these exact phrases verbatim: ${verbatimUnique}` : "",
    "Do not paraphrase the verbatim phrases.",
  ]
    .filter(Boolean)
    .join(" ");
};

const buildAssessmentFeedback = (errors: string[]) => {
  const fixes: string[] = [];
  for (const error of errors) {
    if (error.includes("Contains medical jargon")) {
      fixes.push("Remove all medical jargon; use simple everyday words.");
    }
    if (error.includes("Contains banned phrase")) {
      fixes.push('Do not use "I see", "I hear", or "don\'t worry".');
    }
  }
  fixes.push("Keep assessment under 20 words.");
  return fixes.join(" ");
};

const sanitizeAssessment = (text: string) => {
  let cleaned = text.replace(/^"+|"+$/g, "").trim();
  cleaned = cleaned.replace(/How does this sound to you\??/i, "").trim();
  cleaned = cleaned.replace(/I understand\.?/i, "").trim();
  cleaned = cleaned.replace(/^Based on what you've told me,?/i, "").trim();
  cleaned = cleaned.replace(/This is beyond what I can safely assess remotely\.?/i, "").trim();
  cleaned = cleaned.replace(/Here's what I recommend:?.*/i, "").trim();
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\.+$/g, "").trim();
  return cleaned;
};

const sanitizeAction = (text: string) => {
  let cleaned = text.replace(/^"+|"+$/g, "").trim();
  cleaned = cleaned.replace(/^Here's what I recommend:\s*/i, "").trim();
  cleaned = cleaned.replace(/How does this sound to you\??/i, "").trim();
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\.+$/g, "").trim();
  return cleaned;
};

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages?: ChatMessage[];
    stage?: Stage;
  };

  const messages = body.messages ?? [];
  const stage = body.stage ?? "greeting";
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const userMessages = messages.filter((message) => message.role === "user").map((m) => m.content);
  const symptomContext = userMessages.join(" ");
  const triage = triageConversation(userMessages);

  const triageLevel = stage === "recommendation" ? triage.level : undefined;
  const mode = (process.env.LLM_MODE ?? "mock") === "openai" ? "openai" : "mock";

  const systemPrompt = await loadSystemPrompt();

  let draft = "";
  let error: string | null = null;
  let validation = { ok: false, errors: ["No response generated."] };
  const maxAttempts = 5;

  if (stage === "greeting" || stage === "concern") {
    draft = repairResponse({ stage, triageLevel, latestUserMessage, symptomContext });
    validation = validateResponse(draft, {
      stage,
      triageLevel,
      latestUserMessage,
      symptomContext,
    });
  } else if (mode === "openai") {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const feedback =
          attempt === 0
            ? undefined
            : buildFeedback(validation.errors, symptomContext, stage, triageLevel);
        draft = await generateAssistantReply({
          mode,
          systemPrompt,
          messages,
          stage,
          triageLevel,
          latestUserMessage,
          feedback,
        });
      } catch (err) {
        error = err instanceof Error ? err.message : "LLM error";
        break;
      }

      validation = validateResponse(draft, {
        stage,
        triageLevel,
        latestUserMessage,
        symptomContext,
      });

      if (validation.ok) {
        break;
      }
    }
  } else {
    try {
      draft = await generateAssistantReply({
        mode,
        systemPrompt,
        messages,
        stage,
        triageLevel,
        latestUserMessage,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : "LLM error";
    }

    validation = validateResponse(draft, {
      stage,
      triageLevel,
      latestUserMessage,
      symptomContext,
    });
  }
  let finalText = draft;
  let validationAfter = validateResponse(draft, {
    stage,
    triageLevel,
    latestUserMessage,
    symptomContext,
  });
  let repaired = false;

  if (stage === "recommendation" && triageLevel && triageLevel !== "mild") {
    const actionDefault = sanitizeAction(getEmergencyAction(triageLevel));
    let assessment = "";
    let action = actionDefault;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const feedback =
        attempt === 0 ? undefined : buildAssessmentFeedback(validationAfter.errors);
      let raw = "";
      try {
        raw = await generateAssistantReply({
          mode,
          systemPrompt,
          messages,
          stage,
          triageLevel,
          latestUserMessage,
          feedback,
          responseFormat: "assessment_action",
        });
      } catch (err) {
        error = err instanceof Error ? err.message : "LLM error";
        break;
      }

      try {
        const parsed = JSON.parse(raw) as { assessment?: string; action?: string };
        assessment = sanitizeAssessment(parsed.assessment?.trim() ?? raw.trim());
        action = sanitizeAction(parsed.action?.trim() || actionDefault);
      } catch {
        assessment = sanitizeAssessment(raw.trim());
        action = actionDefault;
      }

      if (!assessment) {
        assessment = "these symptoms could be serious and need urgent evaluation";
      }

      finalText = [
        `Based on what you've told me, ${assessment}.`,
        "I understand.",
        "This is beyond what I can safely assess remotely.",
        `Here's what I recommend: ${action}. How does this sound to you?`,
        "If this isn't improving in 3 days, please contact a local clinic or urgent care.",
        "I can provide guidance, but I cannot replace an in-person examination.",
        "Let's work through this together.",
      ].join(" ");

      validationAfter = validateResponse(finalText, {
        stage,
        triageLevel,
        latestUserMessage,
        symptomContext,
      });

      if (validationAfter.ok) {
        break;
      }
    }
  }
  const emergencyAction =
    stage === "recommendation" && triageLevel && triageLevel !== "mild"
      ? getEmergencyAction(triageLevel)
      : null;

  return NextResponse.json({
    message: finalText,
    nextStage: getNextStage(stage),
    mode,
    triage: {
      level: triage.level,
      redFlags: triage.redFlags,
      highRisk: triage.highRisk,
      severeSignals: triage.severeSignals,
    },
    validation: {
      ok: validationAfter.ok,
      errors: validationAfter.errors,
      repaired,
      draftOk: validation.ok,
      llmError: error,
    },
    emergencyAction,
  });
}
