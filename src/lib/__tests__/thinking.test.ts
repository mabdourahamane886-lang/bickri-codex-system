import { describe, expect, it } from "vitest";
import { getThinkingBudget, getThinkingInstruction, resolveThinkingMode } from "../ai/thinking";

describe("Bickri AI adaptive reasoning", () => {
  it("uses fast mode for simple requests and balanced mode for explanations", () => {
    expect(resolveThinkingMode("Salut !", "auto")).toBe("fast");
    expect(resolveThinkingMode("Explique-moi pourquoi cette approche fonctionne.", "auto")).toBe("balanced");
  });

  it("automatically escalates complex engineering requests", () => {
    expect(resolveThinkingMode("Corrige ce bug de sécurité dans une API Supabase et vérifie les tests.", "auto")).toBe("deep");
  });

  it("respects explicit user-selected modes", () => {
    expect(resolveThinkingMode("Question simple", "fast")).toBe("fast");
    expect(resolveThinkingMode("Question simple", "balanced")).toBe("balanced");
    expect(resolveThinkingMode("Question simple", "deep")).toBe("deep");
    expect(resolveThinkingMode("Question simple", "expert")).toBe("expert");
  });

  it("allocates increasing Gemini thinking budgets", () => {
    expect(getThinkingBudget("fast")).toBe(0);
    expect(getThinkingBudget("balanced")).toBe(1024);
    expect(getThinkingBudget("deep")).toBe(4096);
    expect(getThinkingBudget("expert")).toBe(8192);
  });

  it("keeps expert reasoning explainable without exposing private chain of thought", () => {
    const instruction = getThinkingInstruction("expert");
    expect(instruction).toContain("contre-exemples");
    expect(instruction).toContain("jamais de chaîne de pensée privée");
  });
});
