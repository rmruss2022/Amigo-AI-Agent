import { NextResponse } from "next/server";
import { triageConversation } from "@/lib/triage";
import { repairResponse, type Stage } from "@/lib/repair";
import { validateResponse, buildFeedback, type ValidationContext } from "@/lib/validators";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Determine next stage based on current stage and triage result.
 * Only skip to recommendation for TRUE life-threatening emergencies.
 * Unclear cases (like broken bones) still go through normal flow.
 */
const getNextStage = (stage: Stage, triageLevel: "mild" | "emergency" | "unclear"): Stage => {
  // Only skip to recommendation for TRUE life-threatening emergencies
  if (triageLevel === "emergency") {
    return "recommendation";
  }

  // Normal progression for mild and unclear cases
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

const getEmergencyAction = (triageLevel: "emergency" | "unclear") => {
  if (triageLevel === "unclear") {
    return "Go to urgent care or an emergency department today.";
  }
  return "Call 911 now or go to the nearest emergency department.";
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[];
      stage?: Stage;
    };

    const messages = body.messages ?? [];
    const stage: Stage = body.stage ?? "greeting";
    const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
    const latestUserMessage = userMessages[userMessages.length - 1] || "";

    // Perform triage at EVERY step
    const triage = await triageConversation(userMessages);
    
    // Determine effective stage: only skip to recommendation for TRUE life-threatening emergencies
    // For unclear/high-risk cases (like broken bones), still go through normal flow to gather more info
    // Don't skip if we're in greeting stage (let it progress normally)
    const effectiveStage: Stage = 
      triage.level === "emergency" && userMessages.length > 0 && stage !== "greeting"
        ? "recommendation"
        : stage;

    // Use LLM to generate response, with validation feedback loop
    let response: string = "";
    let validationResult: { ok: boolean; errors: string[]; warnings: string[] } | null = null;
    let repaired = false;
    const mode = (process.env.LLM_MODE ?? "mock") === "openai" ? "openai" : "mock";
    
    if (mode === "openai" && process.env.OPENAI_API_KEY) {
      try {
        // Load system prompt
        const systemPromptPath = require("path").join(process.cwd(), "prompts", "system.md");
        const systemPrompt = await require("fs/promises").readFile(systemPromptPath, "utf8").catch(() => "");
        
        // Validation context for checking responses
        const validationContext: ValidationContext = {
          stage: effectiveStage,
          triageLevel: effectiveStage === "recommendation" ? triage.level : undefined,
          latestUserMessage,
          symptomContext: userMessages.join(" "),
        };

        // Retry loop: up to 5 attempts
        const maxRetries = 5;
        let attempt = 0;
        let lastResponse = "";

        while (attempt < maxRetries) {
          attempt++;
          
          // Build messages for this attempt
          const attemptMessages = [
            { role: "system" as const, content: systemPrompt },
            ...messages,
          ];

          // Add feedback from previous attempt if this is a retry
          if (attempt > 1 && validationResult && !validationResult.ok) {
            const feedback = buildFeedback(validationResult, validationContext);
            attemptMessages.push({
              role: "system" as const,
              content: `Previous response had validation errors. Please fix:\n\n${feedback}\n\nGenerate a corrected response that addresses all the errors above.`,
            });
          } else {
            // First attempt: just add stage context
            attemptMessages.push({
              role: "system" as const,
              content: `Current stage: ${effectiveStage}. Triage level: ${triage.level}. Generate a natural response following all constraints.`,
            });
          }

          // Call OpenAI
          const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
              messages: attemptMessages,
              temperature: 0.7,
            }),
          });

          if (!openaiResponse.ok) {
            throw new Error("OpenAI API error");
          }

          const data = await openaiResponse.json();
          lastResponse = data.choices?.[0]?.message?.content?.trim() || "";

          // Validate the response
          validationResult = validateResponse(lastResponse, validationContext);

          // If validation passes, use this response
          if (validationResult.ok) {
            response = lastResponse;
            break;
          }

          // If this is the last attempt, use the response anyway (don't error)
          if (attempt === maxRetries) {
            console.warn(`Validation failed after ${maxRetries} attempts. Using last response. Errors:`, validationResult.errors);
            response = lastResponse;
            repaired = true;
            break;
          }

          // Otherwise, retry with feedback
          console.log(`Validation failed (attempt ${attempt}/${maxRetries}), retrying with feedback...`);
        }

        // Ensure response is assigned (fallback if loop somehow didn't assign it)
        if (!response && lastResponse) {
          response = lastResponse;
        }
      } catch (error) {
        console.error("LLM error, falling back to templates:", error);
        // Fall back to repair templates
        response = repairResponse({
          stage: effectiveStage,
          triageLevel: effectiveStage === "recommendation" ? triage.level : undefined,
          latestUserMessage,
          symptomContext: userMessages.join(" "),
        });
        validationResult = { ok: true, errors: [], warnings: [] }; // Templates are always compliant
        repaired = true;
      }
    } else {
      // Use repair templates for mock mode
      response = repairResponse({
        stage: effectiveStage,
        triageLevel: effectiveStage === "recommendation" ? triage.level : undefined,
        latestUserMessage,
        symptomContext: userMessages.join(" "),
      });
      validationResult = { ok: true, errors: [], warnings: [] }; // Templates are always compliant
    }

    const emergencyAction =
      effectiveStage === "recommendation" && triage.level !== "mild"
        ? getEmergencyAction(triage.level)
        : null;

    return NextResponse.json({
      message: response,
      nextStage: getNextStage(effectiveStage, triage.level),
      mode,
      triage: {
        level: triage.level,
        redFlags: triage.redFlags,
        highRisk: triage.highRisk || [],
        severeSignals: triage.severeSignals || [],
      },
      validation: {
        ok: validationResult?.ok ?? true,
        errors: validationResult?.errors ?? [],
        warnings: validationResult?.warnings ?? [],
        repaired,
      },
      emergencyAction,
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
