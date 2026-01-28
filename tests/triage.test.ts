import { describe, expect, it } from "vitest";
import { triageConversation } from "../lib/triage";

describe("triageConversation", () => {
  it("flags chest pain with breathing trouble as emergency", async () => {
    const decision = await triageConversation([
      "I have chest pain and I'm having trouble breathing.",
    ]);
    expect(decision.level).toBe("emergency");
    expect(decision.redFlags.length).toBeGreaterThan(0);
  });

  it("treats mild fatigue as mild", async () => {
    const decision = await triageConversation(["I've been tired and a bit fatigued for two days."]);
    expect(decision.level).toBe("mild");
  });

  it("marks high risk without severe signals as unclear", async () => {
    const decision = await triageConversation(["I am pregnant and feeling lightheaded."]);
    expect(decision.level).toBe("unclear");
  });

  it("flags worst headache with neck stiffness as emergency", async () => {
    const decision = await triageConversation([
      "This is the worst headache of my life and my neck feels stiff.",
    ]);
    expect(decision.level).toBe("emergency");
  });

  it("handles critical emergency patterns immediately", async () => {
    const decision = await triageConversation([
      "I'm having chest pain and shortness of breath right now.",
    ]);
    expect(decision.level).toBe("emergency");
    expect(decision.redFlags).toContain("critical_emergency_pattern");
  });
});
