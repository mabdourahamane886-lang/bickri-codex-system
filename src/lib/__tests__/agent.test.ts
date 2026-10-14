import { describe, expect, it } from "vitest";
import { toGeminiSchema } from "../agent/schema";
import { isPrivateAddress } from "../agent/plugins/web";
import { sanitizeContents } from "../agent/run";

describe("conversion des schémas d'outils", () => {
  it("garde les champs utiles et retire les mots-clés non pris en charge", () => {
    const out = toGeminiSchema({
      type: "object", $schema: "x", additionalProperties: false,
      properties: { owner: { type: "string", description: "Propriétaire" }, page: { type: ["number", "null"], minimum: 1 } },
      required: ["owner", "absent"],
    });
    expect(out).toEqual({
      type: "object",
      properties: { owner: { type: "string", description: "Propriétaire" }, page: { type: "number", nullable: true, minimum: 1 } },
      required: ["owner"],
    });
  });
  it("transforme un objet sans propriétés en texte JSON", () => {
    expect(toGeminiSchema({ type: "object" })?.type).toBe("string");
  });
  it("ajoute un type d'éléments aux tableaux", () => {
    expect(toGeminiSchema({ type: "array" })).toEqual({ type: "array", items: { type: "string" } });
  });
});

describe("protection SSRF du plugin Web", () => {
  it.each(["127.0.0.1", "10.2.3.4", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])("refuse %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "140.82.112.3", "2606:4700::1111"])("accepte %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("nettoyage de l'historique de l'agent", () => {
  it("ne garde que les rôles et champs connus", () => {
    const out = sanitizeContents([
      { role: "system", parts: [{ text: "x" }] },
      { role: "user", parts: [{ text: "salut", evil: 1 }] },
      { role: "model", parts: [{ functionCall: { name: "github_list_branches", args: { owner: "a" } }, thoughtSignature: "sig" }] },
      "nope",
    ]);
    expect(out).toEqual([
      { role: "user", parts: [{ text: "salut" }] },
      { role: "model", parts: [{ functionCall: { name: "github_list_branches", args: { owner: "a" } }, thoughtSignature: "sig" }] },
    ]);
  });
  it("renvoie une liste vide pour une entrée invalide", () => {
    expect(sanitizeContents(null)).toEqual([]);
  });
});
