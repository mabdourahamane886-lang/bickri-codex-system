import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { str, type Plugin, type Tool } from "../types";

type SearchResult = { title?: string; url?: string; content?: string };

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
  const text = html.replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr|pre|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title, text };
}

export async function fetchPublic(raw: string) {
  let url = new URL(raw);
  for (let i = 0; i < 4; i++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: {
      "User-Agent": "BickriCodeAI/1.0 (+https://bickri-codex-system.vercel.app)",
      Accept: "text/html,text/plain,application/json,text/markdown;q=0.9,*/*;q=0.5",
    } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
    const type = res.headers.get("content-type") ?? "";
    if (!/text|json|xml|markdown|javascript/.test(type)) return { url: url.href, status: res.status, error: `Type de contenu non pris en charge : ${type || "inconnu"}` };
    const body = (await res.text()).slice(0, 400_000);
    const { title, text } = /html/.test(type) ? htmlToText(body) : { title: "", text: body };
    return { url: url.href, status: res.status, title, content: text.length > 15000 ? text.slice(0, 15000) + "\n…[contenu tronqué]" : text };
  }
  throw new Error("Trop de redirections.");
}

async function searchWeb(query: string) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { error: "TAVILY_API_KEY n'est pas configurée pour la recherche Web." };
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 6, include_answer: false, include_raw_content: false }),
    signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) return { error: `Le moteur de recherche a renvoyé HTTP ${response.status}.` };
  const payload = await response.json() as { results?: SearchResult[] };
  return { query, results: (payload.results ?? []).map((r) => ({ title: str(r.title, 300), url: str(r.url, 1000), excerpt: str(r.content, 1200) })) };
}

export const webPlugin: Plugin = {
  id: "web",
  name: "Web",
  description: "Recherche Web en temps réel et lecture de pages publiques.",
  async load(ctx) {
    if (!ctx.user) return { tools: [], reason: "Connecte-toi pour utiliser les outils Web." };
    const tools: Tool[] = [{
      name: "web_fetch",
      description: "Télécharge le texte d'une page web publique (documentation, README brut, API JSON). Les adresses privées sont refusées.",
      parameters: { type: "object", properties: { url: { type: "string", description: "URL complète en https" } }, required: ["url"] },
      write: false,
      label: (a) => `Lire ${str(a.url, 100)}`,
      run: async (a) => {
        try { return await fetchPublic(str(a.url, 2000)); }
        catch (err) { return { error: err instanceof Error ? err.message : "Lecture impossible." }; }
      },
    }];
    if (process.env.TAVILY_API_KEY) {
      tools.push({
        name: "web_search",
        description: "Recherche des pages Web récentes et pertinentes. Présente les URL retournées comme sources et distingue les résultats trouvés des faits vérifiés.",
        parameters: { type: "object", properties: { query: { type: "string", description: "Question ou sujet à rechercher sur le Web." } }, required: ["query"] },
        write: false,
        label: (a) => `Recherche Web : ${str(a.query, 90)}`,
        run: async (a) => {
          const query = str(a.query, 400).trim();
          if (!query) return { error: "La requête est vide." };
          try { return await searchWeb(query); }
          catch (err) { return { error: err instanceof Error ? err.message : "Recherche impossible." }; }
        },
      });
    }
    return { tools, reason: process.env.TAVILY_API_KEY ? undefined : "Lecture de pages active ; ajoute TAVILY_API_KEY pour activer la recherche Web." };
  },
};
