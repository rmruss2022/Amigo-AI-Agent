import { describe, expect, it } from "vitest";
import { validateResponse } from "../lib/validators";

describe("validateResponse", () => {
  it("accepts mild response with 3 numbered recs", () => {
    const text = [
      "I understand.",
      "1. Rest and drink water. How does this sound to you?",
      "2. Use a cool compress. How does this sound to you?",
      "3. Use pain relief you have used before. How does this sound to you?",
      "If this isn't improving in 3 days, please contact a local clinic or urgent care.",
      "I can provide guidance, but I cannot replace an in-person examination.",
    ].join("\n");
    const result = validateResponse(text, { stage: "recommendation", triageLevel: "mild" });
    expect(result.ok).toBe(true);
  });

  it("accepts emergency response with required format", () => {
    const text = [
      "Based on what you've told me, these symptoms could be serious and need urgent evaluation.",
      "I understand.",
      "This is beyond what I can safely assess remotely.",
      "Here's what I recommend: Please call 911 now. How does this sound to you?",
      "If this isn't improving in 3 days, please contact a local clinic or urgent care.",
      "I can provide guidance, but I cannot replace an in-person examination.",
    ].join(" ");
    const result = validateResponse(text, { stage: "recommendation", triageLevel: "emergency" });
    expect(result.ok).toBe(true);
  });
});
