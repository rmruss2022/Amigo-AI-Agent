import { repairResponse, type RepairContext, type Stage } from "./repair";
import type { TriageLevel } from "./triage";

export type LlmMode = "mock" | "openai";

export type LlmInput = {
  mode: LlmMode;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  stage: Stage;
  triageLevel?: TriageLevel;
  latestUserMessage?: string;
  feedback?: string;
  responseFormat?: "assessment_action";
};

const buildDeveloperPrompt = (
  stage: Stage,
  triageLevel?: TriageLevel,
  feedback?: string,
  responseFormat?: "assessment_action"
) => {
  if (responseFormat === "assessment_action") {
    const lines = [
      "Return ONLY valid JSON with keys assessment and action.",
      'assessment: a short lay-language assessment sentence fragment, no period, no medical jargon.',
      'action: a specific next step in plain language (e.g., "call 911 now").',
      "Do not include any extra text.",
    ];
    if (feedback) {
      lines.push(`Feedback to fix: ${feedback}`);
    }
    return lines.join(" ");
  }

  const stageGuidance = {
    greeting:
      "Provide greeting, consent, and safety disclaimer. Ask the timeline question exactly.",
    clarify:
      "Acknowledge, show empathy, and ask clarifying questions plus red-flag screening. Do not provide recommendations.",
    concern:
      'Ask exactly: "What concerns you most about this?" Do not provide recommendations.',
    recommendation:
      "Provide recommendations using the required format for mild or emergency.",
  } as const;

  const lines = [
    `Stage: ${stage}.`,
    `Triage: ${triageLevel ?? "unknown"}.`,
    stageGuidance[stage],
    "Follow all system constraints exactly. Respond with only the assistant message.",
    "If feedback is provided, you MUST follow it verbatim.",
  ];

  if (stage === "recommendation") {
    if (triageLevel === "mild") {
      lines.push(
        "You MUST output exactly these lines in this order and only fill in bracketed parts:",
        "I understand.",
        "[Optional empathy sentences if needed.]",
        "Based on what you shared about [specific symptom], here are some self-care steps:",
        "1. [Self-care recommendation sentence]. How does this sound to you?",
        "2. [Self-care recommendation sentence]. How does this sound to you?",
        "3. [Self-care recommendation sentence]. How does this sound to you?",
        "If this isn't improving in 3 days, please contact a local clinic or urgent care.",
        "I can provide guidance, but I cannot replace an in-person examination.",
        "Let's work through this together."
      );
    } else {
      lines.push(
        "You MUST output exactly these lines in this order and only fill in bracketed parts:",
        "Based on what you've told me, [assessment].",
        "I understand.",
        "[Optional empathy sentences if needed.]",
        "This is beyond what I can safely assess remotely.",
        "Here's what I recommend: [specific emergency action]. How does this sound to you?",
        "If this isn't improving in 3 days, please contact a local clinic or urgent care.",
        "I can provide guidance, but I cannot replace an in-person examination.",
        "Let's work through this together."
      );
    }
    lines.push("Do NOT use markdown, bullets, or bold formatting.");
    lines.push("Do NOT add any extra sentences beyond the template lines.");
  }

  if (stage === "concern") {
    lines.push(
      "You MUST output exactly these lines in this order and only fill in bracketed parts:",
      "I understand.",
      "[Optional empathy sentences if needed.]",
      "What concerns you most about this?",
      "Do NOT add any extra sentences."
    );
  }

  if (stage === "greeting") {
    lines.push(
      "You MUST output exactly these lines in this order:",
      "Hello! I'm here to help you with your health concerns today.",
      "Before we begin, I want to make sure you're comfortable with this conversation.",
      "Is it okay for us to talk about your symptoms?",
      "Also, please remember that while I can provide guidance, I cannot replace an in-person examination.",
      "When did this first start, and has it been getting better, worse, or staying the same?",
      "Do NOT add any extra sentences."
    );
  }

  if (feedback) {
    lines.push(`Validation errors to fix: ${feedback}`);
  }

  return lines.join(" ");
};

const generateMockReply = (context: RepairContext) => {
  return repairResponse(context);
};

const generateOpenAIReply = async (input: LlmInput) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const developerPrompt = buildDeveloperPrompt(
    input.stage,
    input.triageLevel,
    input.feedback,
    input.responseFormat
  );
  const payload = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "system", content: developerPrompt },
      ...input.messages,
    ],
    temperature: 0.2,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
};

export const generateAssistantReply = async (input: LlmInput) => {
  if (input.mode === "mock") {
    return generateMockReply({
      stage: input.stage,
      triageLevel: input.triageLevel,
      latestUserMessage: input.latestUserMessage,
    });
  }

  return generateOpenAIReply(input);
};
