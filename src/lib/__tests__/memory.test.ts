import { describe, expect, it } from "vitest";
import { formatAuthorizedMemory } from "../ai/memory";

describe("mémoire personnelle persistante", () => {
  it("prioritizes relevant saved memories and bounds the context", () => {
    const result = formatAuthorizedMemory([
      { title: "Langue", content: "Répondre en français pour les projets BCX.", category: "preferences", updated_at: "2026-11-19T10:00:00.000Z" },
      { title: "Ancien projet", content: "Application de météo.", category: "projects", updated_at: "2026-11-20T10:00:00.000Z" },
    ], "Comment répondre en français ?");

    expect(result).toContain("Langue");
    expect(result).not.toContain("Ancien projet");
    expect(result.length).toBeLessThanOrEqual(10_000);
  });

  it("uses only a small recent fallback when the query has no memory match", () => {
    const result = formatAuthorizedMemory([
      { title: "Préférence 1", content: "Premier souvenir", updated_at: "2026-11-19T10:00:00.000Z" },
      { title: "Préférence 2", content: "Deuxième souvenir", updated_at: "2026-11-18T10:00:00.000Z" },
      { title: "Préférence 3", content: "Troisième souvenir", updated_at: "2026-11-17T10:00:00.000Z" },
      { title: "Préférence 4", content: "Quatrième souvenir", updated_at: "2026-11-16T10:00:00.000Z" },
    ], "xyz");

    expect(result).toContain("Préférence 1");
    expect(result).toContain("Préférence 3");
    expect(result).not.toContain("Préférence 4");
  });
});
