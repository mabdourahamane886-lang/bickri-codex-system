import { describe, expect, it } from "vitest";
import { getThinkingInstruction } from "../ai/thinking";

describe("BCX specialist orchestration", () => {
  it("activates the relevant specialist perspectives in deep mode", () => {
    const instruction = getThinkingInstruction("deep");
    expect(instruction).toContain("Architecte");
    expect(instruction).toContain("Développeur");
    expect(instruction).toContain("QA");
    expect(instruction).toContain("Sécurité");
    expect(instruction).toContain("DevOps");
  });

  it("does not claim independent agents were executed", () => {
    expect(getThinkingInstruction("expert")).toContain("il s'agit d'une méthode de revue coordonnée dans le modèle");
  });
});
