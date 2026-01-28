import type { TriageLevel } from "./triage";
import { CONSTRAINTS } from "./validators";

export type Stage = "greeting" | "clarify" | "concern" | "recommendation";

export type RepairContext = {
  stage: Stage;
  triageLevel?: TriageLevel;
  latestUserMessage?: string;
  concernSummary?: string;
  symptomContext?: string;
};

const symptomHints: { keyword: RegExp; label: string }[] = [
  { keyword: /headache|head pain/i, label: "your headache" },
  { keyword: /fatigue|tired|exhausted/i, label: "your fatigue" },
  { keyword: /cough|cold|congestion|runny nose|sore throat/i, label: "your cold symptoms" },
  { keyword: /chest pain|chest pressure|chest tightness/i, label: "your chest discomfort" },
  { keyword: /trouble breathing|difficulty breathing|shortness of breath/i, label: "your breathing trouble" },
  { keyword: /dizzy|lightheaded/i, label: "your dizziness" },
  { keyword: /stomach|nausea|vomit/i, label: "your stomach symptoms" },
];

const detectSymptom = (text?: string) => {
  if (!text) return "your symptoms";
  for (const hint of symptomHints) {
    if (hint.keyword.test(text)) {
      return hint.label;
    }
  }
  return "your symptoms";
};

const hasWorry = (text?: string) =>
  text ? /\b(worried|concerned|scared|anxious|nervous)\b/i.test(text) : false;

const hasPain = (text?: string) =>
  text ? /\b(pain|ache|hurts|hurting|sore|headache|head pain)\b/i.test(text) : false;

const empathyLines = (text?: string, symptomContext?: string) => {
  const lines: string[] = [];
  if (hasPain(text)) {
    lines.push("That sounds really uncomfortable.");
  }
  if (hasWorry(text)) {
    const symptomLabel = detectSymptom(symptomContext || text);
    lines.push(`It's completely understandable that you're concerned about ${symptomLabel}.`);
  }
  return lines;
};

export const repairResponse = (context: RepairContext): string => {
  const symptom = detectSymptom(context.symptomContext || context.latestUserMessage);
  const empathy = empathyLines(context.latestUserMessage, context.symptomContext);
  const comfort = "Let's work through this together.";

  if (context.stage === "greeting") {
    return [
      "Hi, I'm an AI health assistant.",
      `${CONSTRAINTS.DISCLAIMER}.`,
      "If you think you are in immediate danger, please call 911 now.",
      CONSTRAINTS.TIMELINE_QUESTION,
    ].join(" ");
  }

  if (context.stage === "clarify") {
    return [
      "I understand.",
      ...empathy,
      "Please share any other details that feel important.",
      "Are you having any chest pain, trouble breathing, fainting, severe bleeding, new confusion, or one-sided weakness?",
      "Have you noticed blue lips, swelling of your face or tongue, or a severe allergic reaction?",
      "Do you feel your symptoms are suddenly getting much worse?",
      comfort,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (context.stage === "concern") {
    return ["I understand.", ...empathy, CONSTRAINTS.CONCERN_QUESTION].filter(Boolean).join(" ");
  }

  if (context.stage === "recommendation") {
    const followUp = "If this isn't improving in 3 days, please contact a local clinic or urgent care.";
    const disclaimer = `${CONSTRAINTS.DISCLAIMER}.`;

    if (context.triageLevel === "mild") {
      return [
        "I understand.",
        ...empathy,
        `Based on what you shared about ${symptom}, here are some self-care steps:`,
        `1. Rest, drink water, and keep meals light as you can. How does this sound to you?`,
        `2. Use comfort measures like a cool or warm compress, depending on what feels better. How does this sound to you?`,
        `3. Use a pain relief medicine you have used before, like Tylenol or Advil, if it is safe for you. How does this sound to you?`,
        followUp,
        disclaimer,
        comfort,
      ]
        .filter(Boolean)
        .join("\n");
    }

    const assessment =
      context.triageLevel === "unclear"
        ? `I'm concerned because of your risk factors and I can't safely sort this out remotely.`
        : `these symptoms could be serious and need urgent evaluation.`;
    const action =
      context.triageLevel === "unclear"
        ? "Please go to an urgent care or emergency department today."
        : "Please call 911 now or go to the nearest emergency department right away.";

    return [
      `Based on what you've told me, ${assessment}`,
      "I understand.",
      "This is beyond what I can safely assess remotely.",
      `Here's what I recommend: ${action} How does this sound to you?`,
      followUp,
      disclaimer,
      comfort,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return "I understand. Let's work through this together.";
};
