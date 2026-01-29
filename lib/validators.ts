/**
 * Constants used across the system for validation and repair
 */
export const CONSTRAINTS = {
  TIMELINE_QUESTION: "When did this first start, and has it been getting better, worse, or staying the same?",
  CONCERN_QUESTION: "What concerns you most about this?",
  DISCLAIMER: "I can provide guidance, but I cannot replace an in-person examination",
};

export type Stage = "greeting" | "clarify" | "concern" | "recommendation";
export type TriageLevel = "mild" | "emergency" | "unclear";

export type ValidationContext = {
  stage: Stage;
  triageLevel?: TriageLevel;
  latestUserMessage?: string;
  symptomContext?: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Validates a response against all required constraints
 */
export function validateResponse(text: string, context: ValidationContext): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lowerText = text.toLowerCase();

  // Check for banned phrases
  const bannedPhrases = [
    { phrase: "i see", reason: 'Must use "I understand" instead of "I see"' },
    { phrase: "i hear", reason: 'Must use "I understand" instead of "I hear"' },
    { phrase: "don't worry", reason: 'Must use "let\'s work through this together" instead of "don\'t worry"' },
  ];

  for (const { phrase, reason } of bannedPhrases) {
    if (lowerText.includes(phrase)) {
      errors.push(reason);
    }
  }

  // Check for required "I understand" (except in greeting stage)
  if (context.stage !== "greeting" && !lowerText.includes("i understand")) {
    errors.push('Must include "I understand" when acknowledging concerns');
  }

  // Stage-specific validation
  if (context.stage === "greeting") {
    if (!text.includes(CONSTRAINTS.TIMELINE_QUESTION)) {
      errors.push(`Must ask the exact timeline question: "${CONSTRAINTS.TIMELINE_QUESTION}"`);
    }
    if (!text.includes(CONSTRAINTS.DISCLAIMER)) {
      errors.push(`Must include disclaimer: "${CONSTRAINTS.DISCLAIMER}"`);
    }
  }

  if (context.stage === "concern") {
    if (!text.includes(CONSTRAINTS.CONCERN_QUESTION)) {
      errors.push(`Must ask the exact concern question: "${CONSTRAINTS.CONCERN_QUESTION}"`);
    }
  }

  if (context.stage === "recommendation") {
    // Check for disclaimer
    if (!text.includes(CONSTRAINTS.DISCLAIMER)) {
      errors.push(`Must include disclaimer: "${CONSTRAINTS.DISCLAIMER}"`);
    }

    if (context.triageLevel === "mild") {
      // Check for exactly 3 numbered recommendations (handles multi-line)
      // Match lines starting with number followed by period, capturing until next numbered line or end
      const numberedRecs = text.match(/^\d+\.\s.+$/gm) || [];
      if (numberedRecs.length !== 3) {
        errors.push(`Must provide exactly 3 numbered recommendations (found ${numberedRecs.length})`);
      }

      // Check that "How does this sound to you?" appears exactly once at the end (not after each recommendation)
      const checkInPhrase = "how does this sound to you";
      const checkInCount = (text.match(new RegExp(checkInPhrase, "gi")) || []).length;
      if (checkInCount === 0) {
        errors.push('Must end the recommendations paragraph with "How does this sound to you?"');
      } else if (checkInCount > 1) {
        errors.push(`"How does this sound to you?" should appear only once at the end, not after each recommendation (found ${checkInCount} times)`);
      }

      // Check that recommendations don't have the check-in phrase individually
      numberedRecs.forEach((rec, idx) => {
        if (rec.toLowerCase().includes(checkInPhrase)) {
          errors.push(`Recommendation ${idx + 1} should NOT end with "How does this sound to you?" - it should only appear once at the end of all recommendations`);
        }
      });

      // Check for follow-up instruction (without conditional timeframe)
      if (!/\bplease contact.*(healthcare|provider|clinic|urgent care|doctor)\b/i.test(text)) {
        warnings.push('Should include follow-up instruction: "Please contact a healthcare provider for further evaluation."');
      }
    }

    if (context.triageLevel === "emergency" || context.triageLevel === "unclear") {
      // Check emergency format
      if (!text.includes("Based on what you've told me")) {
        errors.push('Must start with "Based on what you\'ve told me..."');
      }
      if (!text.includes("This is beyond what I can safely assess remotely")) {
        errors.push('Must include "This is beyond what I can safely assess remotely"');
      }
      if (!text.includes("Here's what I recommend")) {
        errors.push('Must include "Here\'s what I recommend..."');
      }

      // Emergency should have a single action, not multiple numbered recommendations
      const numberedRecs = text.match(/^\d+\.\s.+$/gm) || [];
      if (numberedRecs.length > 1) {
        errors.push("Emergency recommendations should be a single action, not multiple numbered items");
      }

      // Check for "How does this sound to you?" exactly once at the end
      const checkInCount = (text.match(/how does this sound to you/gi) || []).length;
      if (checkInCount === 0) {
        errors.push('Must end with "How does this sound to you?"');
      } else if (checkInCount > 1) {
        errors.push(`"How does this sound to you?" should appear only once at the end (found ${checkInCount} times)`);
      }
    }
  }

  // Check for empathy phrases when appropriate
  if (context.latestUserMessage) {
    const hasPain = /\b(pain|ache|hurts|hurting|sore|headache|head pain)\b/i.test(context.latestUserMessage);
    const hasWorry = /\b(worried|concerned|scared|anxious|nervous)\b/i.test(context.latestUserMessage);

    if (hasPain && !text.toLowerCase().includes("sounds really uncomfortable")) {
      warnings.push('Should include empathy for pain: "That sounds really uncomfortable"');
    }

    if (hasWorry && !text.toLowerCase().includes("completely understandable")) {
      warnings.push('Should include empathy for worry: "It\'s completely understandable that you\'re concerned about..."');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Builds feedback message for LLM retry
 */
export function buildFeedback(validation: ValidationResult, context: ValidationContext): string {
  const feedbackParts: string[] = [];

  if (validation.errors.length > 0) {
    feedbackParts.push("CRITICAL ERRORS (must fix):");
    validation.errors.forEach((error, idx) => {
      feedbackParts.push(`${idx + 1}. ${error}`);
    });
  }

  if (validation.warnings.length > 0) {
    feedbackParts.push("\nWARNINGS (should fix):");
    validation.warnings.forEach((warning, idx) => {
      feedbackParts.push(`${idx + 1}. ${warning}`);
    });
  }

  // Add verbatim phrases that must be included
  const verbatimPhrases: string[] = [];

  if (context.stage === "greeting") {
    verbatimPhrases.push(CONSTRAINTS.TIMELINE_QUESTION);
    verbatimPhrases.push(CONSTRAINTS.DISCLAIMER);
  }

  if (context.stage === "concern") {
    verbatimPhrases.push(CONSTRAINTS.CONCERN_QUESTION);
  }

  if (context.stage !== "greeting") {
    verbatimPhrases.push("I understand");
  }

  if (context.stage === "recommendation") {
    verbatimPhrases.push(CONSTRAINTS.DISCLAIMER);

    if (context.triageLevel === "mild") {
      // For mild, provide 3 recommendations, then "How does this sound to you?" only once at the end
      feedbackParts.push("\nIMPORTANT: You must provide exactly 3 numbered recommendations (1., 2., 3.).");
      feedbackParts.push("CRITICAL: Do NOT put 'How does this sound to you?' after each recommendation.");
      feedbackParts.push("Put 'How does this sound to you?' only ONCE at the very end, after the follow-up timeframe.");
      verbatimPhrases.push("How does this sound to you?"); // Should appear once at end
    }

    if (context.triageLevel === "emergency" || context.triageLevel === "unclear") {
      verbatimPhrases.push("Based on what you've told me");
      verbatimPhrases.push("This is beyond what I can safely assess remotely");
      verbatimPhrases.push("Here's what I recommend");
      verbatimPhrases.push("How does this sound to you?");
      feedbackParts.push("\nIMPORTANT: Emergency recommendations must be a SINGLE action, not multiple numbered items.");
    }
  }

  if (verbatimPhrases.length > 0) {
    feedbackParts.push(`\nYou MUST include these exact phrases verbatim: ${verbatimPhrases.join(" | ")}`);
  }

  // Add banned phrases reminder
  feedbackParts.push("\nNEVER use these phrases: 'I see', 'I hear', 'don't worry'");

  return feedbackParts.join("\n");
}
