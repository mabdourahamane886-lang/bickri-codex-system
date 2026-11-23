import { describe, expect, it } from "vitest";
import { extractMemoryCandidate } from "./memory-capture";

describe("automatic cloud memory capture", () => {
  it("keeps an explicitly requested memory", () => {
    expect(extractMemoryCandidate("Mémorise que je travaille avec TypeScript.")).toEqual({
      content: "je travaille avec TypeScript",
      category: "explicit",
    });
  });

  it("recognizes preferences with accents and a typographic apostrophe", () => {
    expect(extractMemoryCandidate("À l’avenir, réponds-moi en français.")).toEqual({
      content: "réponds-moi en français",
      category: "preferences",
    });
  });

  it("ignores ordinary requests and candidates containing obvious private data", () => {
    expect(extractMemoryCandidate("Explique ce code TypeScript.")).toBeNull();
    expect(extractMemoryCandidate("Mémorise que mon mot de passe est confidentiel.")).toBeNull();
    expect(extractMemoryCandidate("Retiens que mon e-mail est personne@example.com.")).toBeNull();
  });
});
