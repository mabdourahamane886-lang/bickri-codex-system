import { describe, expect, it } from "vitest";
import { getAIProviderOrder } from "../ai/router";

describe("routage automatique des fournisseurs Bickri AI", () => {
  it("essaie les quatre fournisseurs dans l'ordre automatique", () => {
    expect(getAIProviderOrder("auto")).toEqual(["google", "anthropic", "openai", "openrouter"]);
  });
  it("permet de placer Claude en premier tout en gardant les replis", () => {
    expect(getAIProviderOrder("anthropic")).toEqual(["anthropic", "google", "openai", "openrouter"]);
  });
  it("permet de choisir OpenAI en premier", () => {
    expect(getAIProviderOrder("openai")).toEqual(["openai", "google", "anthropic", "openrouter"]);
  });
  it("permet de choisir OpenRouter en premier", () => {
    expect(getAIProviderOrder("openrouter")).toEqual(["openrouter", "google", "anthropic", "openai"]);
  });
  it("conserve la priorité Gemini lorsqu'elle est demandée", () => {
    expect(getAIProviderOrder("google")).toEqual(["google", "anthropic", "openai", "openrouter"]);
  });
});
