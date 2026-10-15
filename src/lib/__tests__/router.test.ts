import { describe, expect, it } from "vitest";
import { getAIProviderOrder } from "../ai/router";
describe("routage des fournisseurs Bickri AI", () => {
  it("privilégie Gemini par défaut et prévoit un repli compatible OpenAI", () => expect(getAIProviderOrder("auto")).toEqual(["google", "openai"]));
  it("permet de choisir OpenAI en premier", () => expect(getAIProviderOrder("openai")).toEqual(["openai", "google"]));
  it("permet de choisir OpenRouter en premier", () => expect(getAIProviderOrder("openrouter")).toEqual(["openrouter", "google"]));
  it("privilégie Google lorsque ce fournisseur est explicitement choisi", () => expect(getAIProviderOrder("google")).toEqual(["google", "openai"]));
});
