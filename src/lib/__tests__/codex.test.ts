import { describe, expect, it } from "vitest";
import { formatCode, isValidVersion, nextSerial, parseCode, IDENTIFIER_PATTERN, GREEK_LETTERS } from "../codex";
import { createLocal, toCsv, type Entry } from "../registry";

describe("identifiants BCX", () => {
  it("formate avec un numéro sur 3 chiffres", () => {
    expect(formatCode("AI", "THETA", 1)).toBe("BCX-AI-THETA-001");
    expect(formatCode("WEB", "ZETA", 1234)).toBe("BCX-WEB-ZETA-1234");
  });

  it("respecte la contrainte de la base de données", () => {
    expect(IDENTIFIER_PATTERN.test("BCX-AI-THETA-001")).toBe(true);
    expect(IDENTIFIER_PATTERN.test("BCX-ai-THETA-1")).toBe(false);
  });

  it("analyse un identifiant", () => {
    expect(parseCode("BCX-SEC-OMEGA-042")).toEqual({ category: "SEC", greek: "OMEGA", serial: 42 });
    expect(parseCode("invalide")).toBeNull();
  });

  it("valide les versions X.Y.Z", () => {
    expect(isValidVersion("1.0.0")).toBe(true);
    expect(isValidVersion(" 2.10.3 ")).toBe(true);
    expect(isValidVersion("1.0")).toBe(false);
    expect(isValidVersion("v1.0.0")).toBe(false);
  });

  it("calcule le prochain numéro par catégorie et série", () => {
    const ids = ["BCX-AI-THETA-001", "BCX-AI-THETA-003", "BCX-AI-BETA-009", "BCX-WEB-THETA-007"];
    expect(nextSerial(ids, "AI", "THETA")).toBe(4);
    expect(nextSerial(ids, "AI", "BETA")).toBe(10);
    expect(nextSerial(ids, "APP", "THETA")).toBe(1);
    expect(nextSerial(ids, "AI", "THETA", 10)).toBe(11);
  });

  it("contient les 24 lettres grecques", () => {
    expect(GREEK_LETTERS).toHaveLength(24);
    expect(GREEK_LETTERS[23]).toEqual({ name: "OMEGA", symbol: "Ω", ordinal: 24 });
  });
});

describe("registre local", () => {
  const base: Entry[] = [{ id: "BCX-AI-THETA-001", name: "A", category: "AI", greek: "THETA", version: "1.0.0", status: "active", createdAt: "2026-10-09", source: "local" }];

  it("crée un identifiant sans collision", () => {
    const e = createLocal(base, { name: "B", category: "AI", greek: "THETA", version: "1.0.0" });
    expect(e.id).toBe("BCX-AI-THETA-002");
    expect(e.source).toBe("local");
  });

  it("exporte un CSV avec BOM UTF-8 et guillemets échappés", () => {
    const csv = toCsv([{ ...base[0], name: 'Projet "X"' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Projet ""X"""');
  });
});
