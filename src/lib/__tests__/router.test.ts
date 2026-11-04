import { describe, expect, it } from "vitest";
import { getAIProviderOrder } from "../ai/router";

describe("routage des fournisseurs Bickri AI", () => {
  it("utilise Gemini comme fournisseur unique", () => {
    expect(getAIProviderOrder()).toEqual(["google"]);
  });
});
