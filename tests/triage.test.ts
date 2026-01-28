import { describe, expect, it } from "vitest";
import { triageConversation } from "../lib/triage";

describe("triageConversation", () => {
  it("flags chest pain with breathing trouble as emergency", () => {
    const decision = triageConversation([
      "I have chest pain and I'm having trouble breathing.",
    ]);
    expect(decision.level).toBe("emergency");
    expect(decision.redFlags.length).toBeGreaterThan(0);
  });

  it("treats mild fatigue as mild", () => {
    const decision = triageConversation(["I've been tired and a bit fatigued for two days."]);
    expect(decision.level).toBe("mild");
  });

  it("marks high risk without severe signals as unclear", () => {
    const decision = triageConversation(["I am pregnant and feeling lightheaded."]);
    expect(decision.level).toBe("unclear");
  });

  it("flags worst headache with neck stiffness as emergency", () => {
    const decision = triageConversation([
      "This is the worst headache of my life and my neck feels stiff.",
    ]);
    expect(decision.level).toBe("emergency");
  });
});
