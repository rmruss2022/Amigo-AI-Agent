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

/**
 * Generate relevant red flag screening questions based on the symptoms mentioned.
 * Returns questions that are contextually appropriate rather than generic.
 */
const generateRedFlagQuestions = (symptomContext?: string): string[] => {
  const text = (symptomContext || "").toLowerCase();
  const questions: string[] = [];

  // Head-related symptoms (be specific to avoid matching "head" in other words)
  if (/\b(headache|head pain|headache|migraine)\b/i.test(text)) {
    questions.push("Is this the worst headache you've ever had?");
    questions.push("Do you have any neck stiffness or pain?");
    questions.push("Have you noticed any vision changes, confusion, or trouble speaking?");
  }

  // Chest/respiratory symptoms
  if (/chest|breathing|breath|wheezing|cough/i.test(text)) {
    questions.push("Are you having any chest pain, pressure, or tightness?");
    questions.push("Have you noticed any blue lips or difficulty catching your breath?");
    questions.push("Are you feeling lightheaded, dizzy, or like you might pass out?");
  }

  // Stomach/digestive symptoms
  if (/stomach|nausea|vomit|vomiting|diarrhea|abdominal|belly/i.test(text)) {
    questions.push("Are you vomiting blood or seeing blood in your stool?");
    questions.push("Is the pain severe or getting worse quickly?");
    questions.push("Are you able to keep fluids down?");
  }

  // Neurological symptoms
  if (/dizzy|dizziness|lightheaded|faint|confusion|weakness|numb/i.test(text)) {
    questions.push("Have you noticed any one-sided weakness or numbness?");
    questions.push("Are you having trouble speaking or seeing clearly?");
    questions.push("Have you fainted or lost consciousness?");
  }

  // Allergic reaction symptoms
  if (/swelling|swollen|rash|hives|allergic|tongue|face/i.test(text)) {
    questions.push("Is your face, tongue, or throat swelling?");
    questions.push("Are you having trouble breathing or swallowing?");
    questions.push("Did this start after eating something or taking a medication?");
  }

  // Pain-related (general)
  if (/pain|ache|hurts|hurting|sore/i.test(text) && !questions.length) {
    questions.push("Is the pain severe or getting worse quickly?");
    questions.push("Are you able to function normally, or is it interfering with daily activities?");
  }

  // Always include critical general questions if we haven't covered them
  const hasGeneralQuestions = questions.some(
    (q) =>
      q.includes("chest pain") ||
      q.includes("trouble breathing") ||
      q.includes("fainting") ||
      q.includes("confusion") ||
      q.includes("weakness")
  );

  if (!hasGeneralQuestions) {
    questions.push("Are you having any chest pain, trouble breathing, or feeling like you might pass out?");
  }

  // Always ask about severe bleeding and rapid worsening
  questions.push("Are you experiencing severe bleeding that won't stop, or do your symptoms seem to be getting much worse very quickly?");

  return questions;
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
    const redFlagQuestions = generateRedFlagQuestions(context.symptomContext || context.latestUserMessage);
    // Ensure questions end with ? but don't double up
    const formattedQuestions = redFlagQuestions.map((q) => (q.endsWith("?") ? q : q + "?"));
    return [
      "I understand.",
      ...empathy,
      "Please share any other details that feel important.",
      ...formattedQuestions,
      comfort,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (context.stage === "concern") {
    return ["I understand.", ...empathy, CONSTRAINTS.CONCERN_QUESTION].filter(Boolean).join(" ");
  }

  if (context.stage === "recommendation") {
    const followUp = "Please contact a healthcare provider for further evaluation.";
    const disclaimer = `${CONSTRAINTS.DISCLAIMER}.`;

    if (context.triageLevel === "mild") {
      return [
        "I understand.",
        ...empathy,
        disclaimer,
        `Based on what you shared about ${symptom}, here are some self-care steps:`,
        `1. Rest, drink water, and keep meals light as you can.`,
        `2. Use comfort measures like a cool or warm compress, depending on what feels better.`,
        `3. Use a pain relief medicine you have used before, like Tylenol or Advil, if it is safe for you.`,
        followUp,
        "How does this sound to you?",
      ]
        .filter(Boolean)
        .join("\n");
    }

    // Emergency or unclear cases - immediate action needed
    const assessment =
      context.triageLevel === "unclear"
        ? `I'm concerned because of your risk factors and I can't safely sort this out remotely.`
        : `these symptoms could be serious and need urgent evaluation.`;
    const action =
      context.triageLevel === "unclear"
        ? "Please go to an urgent care or emergency department today."
        : "Please call 911 now or go to the nearest emergency department right away.";

    // For emergencies, only include essential information - no 3-day follow-up or casual closing
    return [
      `Based on what you've told me, ${assessment}`,
      "I understand.",
      ...empathy,
      "This is beyond what I can safely assess remotely.",
      `Here's what I recommend: ${action} How does this sound to you?`,
      disclaimer,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return "I understand. Let's work through this together.";
};
