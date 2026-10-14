import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { str, type Plugin } from "../types";

/** Bloque les adresses privées, locales et de métadonnées (protection SSRF). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Seuls les liens http et https sont acceptés.");
  if (url.username || url.password) throw new Error("Les identifiants dans l'URL ne sont pas acceptés.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Adresse interne refusée.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("Adresse privée ou interne refusée.");
}

function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr|pre|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title, text };
}

export async function fetchPublic(raw: string) {
  let url = new URL(raw);
  for (let i = 0; i < 4; i++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "BickriCodeAI/1.0 (+https://bickri-codex-system.vercel.app)", Accept: "text/html,text/plain,application/json,text/markdown;q=0.9,*/*;q=0.5" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
    const type = res.headers.get("content-type") ?? "";
    if (!/text|json|xml|markdown|javascript/.test(type)) return { url: url.href, status: res.status, error: `Type de contenu non pris en charge : ${type || "inconnu"}` };
    const body = (await res.text()).slice(0, 400_000);
    const { title, text } = /html/.test(type) ? htmlToText(body) : { title: "", text: body };
    return { url: url.href, status: res.status, title, content: text.length > 15000 ? text.slice(0, 15000) + "\n…[contenu tronqué]" : text };
  }
  throw new Error("Trop de redirections.");
}

export const webPlugin: Plugin = {
  id: "web",
  name: "Web",
  description: "Lire une page web publique (documentation, article, fichier brut).",
  async load(ctx) {
    if (!ctx.user) return { tools: [], reason: "Connecte-toi pour utiliser la lecture web." };
    return {
      tools: [{
        name: "web_fetch",
        description: "Télécharge le texte d'une page web publique (documentation, README brut, API JSON). Les adresses privées sont refusées.",
        parameters: { type: "object", properties: { url: { type: "string", description: "URL complète en https" } }, required: ["url"] },
        write: false,
        label: (a) => `Lire ${str(a.url, 100)}`,
        run: async (a) => {
          try { return await fetchPublic(str(a.url, 2000)); }
          catch (err) { return { error: err instanceof Error ? err.message : "Lecture impossible." }; }
        },
      }],
    };
  },
};
