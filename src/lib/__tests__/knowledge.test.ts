import { describe, expect, it } from "vitest";
import { getRelevantKnowledge, listKnowledgeDomains } from "../ai/knowledge";

describe("contextual AI knowledge", () => {
  it("always includes the core reasoning and source-verification guidance", () => {
    const knowledge = getRelevantKnowledge("");
    expect(knowledge).toContain("MÉTHODE DE CONNAISSANCE ET DE RAISONNEMENT");
    expect(knowledge).toContain("N'invente jamais une source");
  });

  it("selects relevant knowledge for the user's question", () => {
    const knowledge = getRelevantKnowledge("Comment corriger une erreur de déploiement Vercel ?");
    expect(knowledge).toContain("[DOMAINE : deployment]");
    expect(knowledge).toContain("logs du build");
  });

  it("supports multiple knowledge domains without external dependencies", () => {
    const knowledge = getRelevantKnowledge("Configurer Supabase et sécuriser une clé API");
    expect(knowledge).toContain("[DOMAINE : database]");
    expect(knowledge).toContain("[DOMAINE : security]");
    expect(listKnowledgeDomains()).toContain("ai-llm-rag");
    expect(listKnowledgeDomains().length).toBeGreaterThanOrEqual(10);
  });
});
