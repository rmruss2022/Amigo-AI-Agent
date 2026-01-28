import type { TriageLevel } from "./triage";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export type ValidationContext = {
  stage: "greeting" | "clarify" | "concern" | "recommendation";
  triageLevel?: TriageLevel;
  latestUserMessage?: string;
  symptomContext?: string;
};

const TIMELINE_QUESTION =
  "When did this first start, and has it been getting better, worse, or staying the same?";
const CONCERN_QUESTION = "What concerns you most about this?";
const DISCLAIMER =
  "I can provide guidance, but I cannot replace an in-person examination";
const FOLLOW_UP_REGEX = /If this isn't improving in \d+ days, please contact/i;

const BANNED_PHRASES = [
  /\bI see\b/i,
  /\bI hear\b/i,
  /\bdon't worry\b/i,
];

const JARGON_PATTERNS = [
  /\bhypertension\b/i,
  /\bhypotension\b/i,
  /\btachycardia\b/i,
  /\bbradycardia\b/i,
  /\bdyspnea\b/i,
  /\bsyncope\b/i,
  /\bedema\b/i,
  /\bmyocardial\b/i,
  /\bischemia\b/i,
  /\barrhythmia\b/i,
  /\banaphylaxis\b/i,
  /\bcva\b/i,
  /\bmi\b/i,
  /\bhematoma\b/i,
  /\bneurologic\b/i,
  /\bintracranial\b/i,
];

const hasBannedPhrase = (text: string) =>
  BANNED_PHRASES.some((pattern) => pattern.test(text));

const hasJargon = (text: string) => {
  return JARGON_PATTERNS.some((pattern) => pattern.test(text));
};

const countNumberedRecs = (text: string) => {
  const matches = text.match(/^\d\.\s.+/gm);
  return matches ?? [];
};

const recsEndWithCheckIn = (lines: string[]) => {
  return lines.every((line) => line.trim().endsWith("How does this sound to you?"));
};

const symptomHints: { keyword: RegExp; label: string }[] = [
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

const detectSymptom = (text?: string) => {
  if (!text) return "your symptoms";
  for (const hint of symptomHints) {
    if (hint.keyword.test(text)) {
      return hint.label;
    }
  }
  return "your symptoms";
};

const hasPain = (text?: string) =>
  text ? /\b(pain|ache|hurts|hurting|sore|headache|head pain)\b/i.test(text) : false;

const hasWorry = (text?: string) =>
  text ? /\b(worried|concerned|scared|anxious|nervous)\b/i.test(text) : false;

export const validateResponse = (
  text: string,
  context: ValidationContext
): ValidationResult => {
  const errors: string[] = [];

  if (hasBannedPhrase(text)) {
    errors.push("Contains banned phrase (I see/I hear/don't worry).");
  }
  if (hasJargon(text)) {
    errors.push("Contains medical jargon.");
  }
  if (context.stage !== "greeting" && !text.includes("I understand")) {
    errors.push('Missing required acknowledgment phrase "I understand".');
  }
  if (context.latestUserMessage) {
    if (hasPain(context.latestUserMessage) && !text.includes("That sounds really uncomfortable")) {
      errors.push('Missing required pain empathy phrase "That sounds really uncomfortable".');
    }
    if (
      hasWorry(context.latestUserMessage) &&
      !text.includes("It's completely understandable that you're concerned about")
    ) {
      errors.push(
        'Missing required worry empathy phrase "It\'s completely understandable that you\'re concerned about [specific symptom]".'
      );
    } else if (hasWorry(context.latestUserMessage) && context.symptomContext) {
      const symptomLabel = detectSymptom(context.symptomContext);
      if (
        symptomLabel !== "your symptoms" &&
        !text.includes(`It's completely understandable that you're concerned about ${symptomLabel}`)
      ) {
        errors.push("Worry empathy phrase must reference the specific symptom.");
      }
    }
  }

  if (context.stage === "greeting" && !text.includes(TIMELINE_QUESTION)) {
    errors.push("Missing exact timeline question.");
  }

  if (context.stage === "concern" && !text.includes(CONCERN_QUESTION)) {
    errors.push('Missing exact "What concerns you most about this?" question.');
  }

  if (context.stage === "recommendation") {
    if (!text.includes(DISCLAIMER)) {
      errors.push("Missing in-person examination disclaimer.");
    }
    if (!FOLLOW_UP_REGEX.test(text)) {
      errors.push("Missing exact follow-up timeframe sentence.");
    }
    if (context.triageLevel === "mild") {
      const recs = countNumberedRecs(text);
      if (recs.length !== 3) {
        errors.push("Mild response must include exactly 3 numbered recommendations.");
      } else if (!recsEndWithCheckIn(recs)) {
        errors.push("Each numbered recommendation must end with the check-in phrase.");
      }
    }
    if (context.triageLevel === "emergency" || context.triageLevel === "unclear") {
      if (!text.startsWith("Based on what you've told me")) {
        errors.push('Emergency response must start with "Based on what you\'ve told me...".');
      }
      if (!text.includes("Here's what I recommend")) {
        errors.push('Emergency response must include "Here\'s what I recommend...".');
      }
      if (!text.includes("This is beyond what I can safely assess remotely")) {
        errors.push("Emergency response missing escalation safety phrase.");
      }
      const recLines = text
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .filter((line) => line.includes("How does this sound to you?"));
      if (recLines.length === 0) {
        errors.push("Emergency response must end recommendation with check-in phrase.");
      }
    }
  }

  return { ok: errors.length === 0, errors };
};

export const CONSTRAINTS = {
  TIMELINE_QUESTION,
  CONCERN_QUESTION,
  DISCLAIMER,
};
