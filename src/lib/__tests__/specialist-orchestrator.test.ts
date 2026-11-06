import { describe, expect, it } from "vitest";
import { formatSpecialistReviews, type SpecialistReview } from "../agent/specialist-orchestrator";

describe("BCX specialist orchestration", () => {
  it("formats independent specialist findings for the main agent", () => {
    const reviews: SpecialistReview[] = [
      { specialist: "architect", label: "Architecte logiciel", summary: "Constats : contrat API à vérifier." },
      { specialist: "quality_security", label: "QA et sécurité", summary: "Risques : contrôle d'accès à tester." },
    ];
    const prompt = formatSpecialistReviews(reviews);
    expect(prompt).toContain("Architecte logiciel");
    expect(prompt).toContain("QA et sécurité");
    expect(prompt).toContain("ne prouvent pas qu'un test");
  });

  it("returns no extra context when no specialist completed", () => {
    expect(formatSpecialistReviews([])).toBe("");
  });
});
