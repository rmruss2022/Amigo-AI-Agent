export type TriageLevel = "mild" | "emergency" | "unclear";

export type TriageDecision = {
  level: TriageLevel;
  redFlags: string[];
  highRisk: string[];
  severeSignals: string[];
  reasoning?: string; // AI-generated reasoning for the decision
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
  { id: "broken_bone", pattern: /\b(broke|broken|fracture|fractured|dislocated)\b/i },
];

const flattenMessages = (messages: string[]) => messages.join(" ").toLowerCase();

/**
 * Critical emergency patterns that must trigger immediate emergency response.
 * These are checked FIRST as a safety net before any AI call.
 */
const CRITICAL_EMERGENCY_PATTERNS: RegExp[] = [
  /(chest (pain|pressure|tightness).*(shortness of breath|trouble breathing|can't breathe|sweating|faint|passed out))/i,
  /(difficulty breathing|trouble breathing|can't breathe).*(blue lips|lips are blue)/i,
  /(new confusion|confused suddenly|sudden confusion).*(trouble speaking|slurred speech|one[- ]sided weakness)/i,
  /(swollen (face|tongue)).*(trouble breathing|can't breathe)/i,
  /(severe bleeding|bleeding heavily|won't stop bleeding)/i,
  /(seizure|convulsions)/i,
  /(worst headache of (my|your) life|worst headache ever).*(neck stiffness|stiff neck|confused|confusion)/i,
];

/**
 * Immediate safety check - if any critical pattern matches, return emergency immediately.
 * This ensures we never miss life-threatening situations even if AI fails.
 */
const checkCriticalEmergencies = (text: string): TriageDecision | null => {
  for (const pattern of CRITICAL_EMERGENCY_PATTERNS) {
    if (pattern.test(text)) {
      return {
        level: "emergency",
        redFlags: ["critical_emergency_pattern"],
        highRisk: [],
        severeSignals: [],
        reasoning: "Critical emergency pattern detected - immediate escalation required",
      };
    }
  }
  return null;
};

/**
 * Fallback rule-based triage (used when OpenAI is unavailable or fails)
 */
const ruleBasedTriage = (messages: string[]): TriageDecision => {
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

  // Broken bones need medical attention but aren't life-threatening - mark as unclear
  const hasBrokenBone = severeSignals.includes("broken_bone");
  const otherSevereSignals = severeSignals.filter((s) => s !== "broken_bone");
  
  if (redFlags.length > 0 || otherSevereSignals.length > 0) {
    return { level: "emergency", redFlags, highRisk, severeSignals };
  }
  
  // Broken bones/fractures need medical evaluation but go through normal flow
  if (hasBrokenBone) {
    return { level: "unclear", redFlags, highRisk, severeSignals };
  }

  if (highRisk.length > 0) {
    return { level: "unclear", redFlags, highRisk, severeSignals };
  }

  return { level: "mild", redFlags, highRisk, severeSignals };
};

/**
 * Use OpenAI to perform triage analysis on the conversation.
 * Returns structured JSON with triage decision and reasoning.
 */
const aiTriage = async (conversationText: string): Promise<TriageDecision | null> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null; // Fall back to rule-based if no API key
  }

  const prompt = `You are a medical triage assistant. Analyze the following patient conversation and determine the appropriate triage level.

Conversation:
${conversationText}

Return ONLY valid JSON with this exact structure:
{
  "level": "mild" | "emergency" | "unclear",
  "redFlags": ["array", "of", "detected", "red", "flags"],
  "highRisk": ["array", "of", "high", "risk", "factors"],
  "severeSignals": ["array", "of", "severe", "signals"],
  "reasoning": "brief explanation of your decision"
}

Triage guidelines:
- "emergency": Life-threatening symptoms, severe distress, OR symptoms requiring immediate medical attention including: chest pain with breathing trouble, stroke-like symptoms, severe allergic reactions, severe bleeding, seizures, broken bones/fractures, dislocations, severe injuries that need X-rays or medical evaluation
- "unclear": High-risk patients (pregnant, very young infants, immunocompromised) with symptoms that need professional evaluation but aren't immediately life-threatening
- "mild": Common, non-urgent symptoms that can be managed with self-care (mild headaches, fatigue, minor cold symptoms, etc.)

Be conservative - when in doubt, err on the side of caution and escalate. Broken bones, fractures, and dislocations always need medical evaluation.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a medical triage assistant. Return ONLY valid JSON, no other text.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1, // Low temperature for consistent, conservative triage
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI triage error:", response.status, errorText);
      return null; // Fall back to rule-based
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as {
      level?: string;
      redFlags?: string[];
      highRisk?: string[];
      severeSignals?: string[];
      reasoning?: string;
    };

    // Validate and normalize the response
    let level = parsed.level === "emergency" || parsed.level === "unclear" ? parsed.level : "mild";
    
    // Post-process: Broken bones need medical attention but should go through normal flow (unclear, not emergency)
    const hasBrokenBone = Array.isArray(parsed.severeSignals) && parsed.severeSignals.some((s: string) => 
      /broken|fracture|dislocation/i.test(s)
    ) || /\b(broke|broken|fracture|fractured|dislocated)\b/i.test(conversationText);
    
    if (hasBrokenBone && level === "emergency") {
      level = "unclear"; // Broken bones need medical evaluation but aren't life-threatening
    }
    
    return {
      level: level as TriageLevel,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
      highRisk: Array.isArray(parsed.highRisk) ? parsed.highRisk : [],
      severeSignals: Array.isArray(parsed.severeSignals) ? parsed.severeSignals : [],
      reasoning: parsed.reasoning || "AI triage analysis",
    };
  } catch (error) {
    console.error("Error in AI triage:", error);
    return null; // Fall back to rule-based
  }
};

/**
 * Main triage function - uses AI when available, falls back to rules.
 * Always checks critical emergencies first for immediate safety.
 */
export const triageConversation = async (messages: string[]): Promise<TriageDecision> => {
  const conversationText = messages.join(" ");

  // Step 1: Check critical emergencies first (safety net)
  const criticalCheck = checkCriticalEmergencies(conversationText);
  if (criticalCheck) {
    return criticalCheck;
  }

  // Step 2: Try AI triage if available
  const aiResult = await aiTriage(conversationText);
  if (aiResult) {
    return aiResult;
  }

  // Step 3: Fall back to rule-based triage
  return ruleBasedTriage(messages);
};
