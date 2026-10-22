import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  GREEK_LETTERS,
  formatCode,
  isValidCode,
  isValidVersion,
  nextCode,
  nextSerial,
  parseCode,
} from "./codex";

describe("règles des identifiants BCX", () => {
  it("définit les six catégories et les 24 séries grecques", () => {
    expect(CATEGORIES.map((item) => item.code)).toEqual(["AI", "APP", "WEB", "SYS", "SEC", "LAB"]);
    expect(GREEK_LETTERS).toHaveLength(24);
    expect(GREEK_LETTERS[0]?.name).toBe("ALPHA");
    expect(GREEK_LETTERS[23]?.name).toBe("OMEGA");
  });

  it("formate un identifiant avec au moins trois chiffres", () => {
    expect(formatCode("AI", "THETA", 1)).toBe("BCX-AI-THETA-001");
    expect(formatCode("WEB", "OMEGA", 1000)).toBe("BCX-WEB-OMEGA-1000");
  });

  it("analyse et valide les identifiants autorisés", () => {
    expect(parseCode("BCX-AI-THETA-001")).toEqual({ category: "AI", greek: "THETA", serial: 1 });
    expect(isValidCode("BCX-AI-THETA-001")).toBe(true);
    expect(isValidCode("BCX-UNKNOWN-THETA-001")).toBe(false);
    expect(isValidCode("BCX-AI-UNKNOWN-001")).toBe(false);
    expect(isValidCode("BCX-AI-THETA-01")).toBe(false);
    expect(isValidCode("BCX-AI-THETA-000")).toBe(false);
    expect(isValidCode("https://example.com")).toBe(false);
  });

  it("calcule le prochain numéro uniquement pour la catégorie et la série demandées", () => {
    const ids = [
      "BCX-AI-THETA-001",
      "BCX-AI-THETA-003",
      "BCX-AI-ALPHA-099",
      "BCX-WEB-THETA-200",
      "BCX-AI-THETA-invalid",
    ];
    expect(nextSerial(ids, "AI", "THETA")).toBe(4);
    expect(nextCode(ids, "AI", "THETA")).toBe("BCX-AI-THETA-004");
    expect(nextCode(ids, "APP", "OMEGA")).toBe("BCX-APP-OMEGA-001");
  });

  it("refuse une catégorie ou une série non reconnue", () => {
    expect(() => nextCode([], "BAD", "THETA")).toThrow("Catégorie BCX invalide.");
    expect(() => nextCode([], "AI", "BAD")).toThrow("Série grecque invalide.");
  });

  it("valide les versions sémantiques à trois segments", () => {
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("0.0.1")).toBe(true);
    expect(isValidVersion("1.2")).toBe(false);
    expect(isValidVersion("v1.2.3")).toBe(false);
  });
});
