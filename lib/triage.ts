export type TriageLevel = "mild" | "emergency" | "unclear";

export type TriageDecision = {
  level: TriageLevel;
  redFlags: string[];
  highRisk: string[];
  severeSignals: string[];
};

const RED_FLAG_RULES: { id: string; patterns: RegExp[] }[] = [
  {
    id: "breathing_distress",
    patterns: [
      /(difficulty breathing|trouble breathing|can't breathe|breathing is hard)/i,
      /(blue lips|lips are blue)/i,
      /(severe wheezing|wheezing a lot|wheezing badly)/i,
    ],
  },
  {
    id: "stroke_like",
    patterns: [
      /(new confusion|confused suddenly|sudden confusion)/i,
      /(trouble speaking|slurred speech|can't speak clearly)/i,
      /(one[- ]sided weakness|face drooping|arm weakness)/i,
    ],
  },
  {
    id: "severe_allergic_reaction",
    patterns: [
      /(swollen face|face swelling|swelling of face)/i,
      /(swollen tongue|tongue swelling)/i,
      /(trouble breathing|difficulty breathing|can't breathe)/i,
    ],
  },
  {
    id: "severe_bleeding_or_seizure",
    patterns: [
      /(severe bleeding|bleeding heavily|won't stop bleeding)/i,
      /(passing out|passed out|fainted)/i,
      /(seizure|convulsions)/i,
    ],
  },
  {
    id: "worst_headache_with_neck",
    patterns: [
      /(worst headache of (my|your) life|worst headache ever)/i,
      /(neck stiffness|stiff neck|neck feels stiff|neck is stiff|confused|confusion)/i,
    ],
  },
];

const HIGH_RISK_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: "pregnant", pattern: /\b(pregnant|pregnancy)\b/i },
  { id: "infant", pattern: /\b(newborn|infant|baby|two month|2 month|three month|3 month)\b/i },
  { id: "immunocompromised", pattern: /\b(immunocompromised|chemo|transplant|hiv)\b/i },
];

const SEVERE_SIGNAL_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: "severe", pattern: /\bsevere\b/i },
  { id: "rapid_worsening", pattern: /\b(rapidly worsening|getting worse fast|worse quickly)\b/i },
  { id: "sudden_worse", pattern: /\b(sudden|suddenly worse)\b/i },
  { id: "can_not_function", pattern: /\b(can't function|can't move|can't stay awake)\b/i },
];

const flattenMessages = (messages: string[]) => messages.join(" ").toLowerCase();

export const triageConversation = (messages: string[]): TriageDecision => {
  const joined = flattenMessages(messages);
  const redFlags: string[] = [];
  const highRisk: string[] = [];
  const severeSignals: string[] = [];

  const hasChest = /chest (pain|pressure|tightness)/i.test(joined);
  const hasBreathing = /(shortness of breath|trouble breathing|difficulty breathing|can't breathe)/i.test(
    joined
  );
  const hasSweating = /(sweating|cold sweat|clammy)/i.test(joined);
  const hasFainting = /(faint|passed out|blackout)/i.test(joined);

  if (hasChest && (hasBreathing || hasSweating || hasFainting)) {
    redFlags.push("chest_pain_with_red_flags");
  }

  for (const rule of RED_FLAG_RULES) {
    const [a, b, c] = rule.patterns;
    if (c) {
      if (a.test(joined) && b.test(joined) && c.test(joined)) {
        redFlags.push(rule.id);
      }
    } else if (a.test(joined) && b.test(joined)) {
      redFlags.push(rule.id);
    }
  }

  for (const risk of HIGH_RISK_PATTERNS) {
    if (risk.pattern.test(joined)) {
      highRisk.push(risk.id);
    }
  }

  for (const signal of SEVERE_SIGNAL_PATTERNS) {
    if (signal.pattern.test(joined)) {
      severeSignals.push(signal.id);
    }
  }

  if (redFlags.length > 0 || severeSignals.length > 0) {
    return { level: "emergency", redFlags, highRisk, severeSignals };
  }

  if (highRisk.length > 0) {
    return { level: "unclear", redFlags, highRisk, severeSignals };
  }

  return { level: "mild", redFlags, highRisk, severeSignals };
};
