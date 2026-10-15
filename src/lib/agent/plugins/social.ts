import "server-only";
import { str, type Plugin } from "../types";
type SearchResult = { title?: string; url?: string; content?: string };
const PLATFORMS: Record<string, string> = {
  all: "", youtube: "site:youtube.com", instagram: "site:instagram.com",
  facebook: "site:facebook.com", tiktok: "site:tiktok.com",
  x: "site:x.com OR site:twitter.com", linkedin: "site:linkedin.com",
};

/** Recherche des contenus publics indexés, pas les données privées ni les statistiques internes. */
export const socialPlugin: Plugin = {
  id: "social",
  name: "Réseaux sociaux",
  description: "Recherche des contenus publics indexés sur les réseaux sociaux et fournit les URL sources.",
  async load(ctx) {
    if (!ctx.user) return { tools: [], reason: "Connecte-toi pour utiliser la recherche sociale." };
    if (!process.env.TAVILY_API_KEY) return { tools: [], reason: "TAVILY_API_KEY n'est pas configurée." };
    return { tools: [{
      name: "social_search_public",
      description: "Recherche des publications, profils, vidéos ou sujets publics indexés sur un réseau social. Ne prétends jamais accéder aux messages privés ou aux statistiques privées.",
      parameters: { type: "object", properties: {
        query: { type: "string", description: "Sujet, nom public, mot-clé ou hashtag." },
        platform: { type: "string", enum: Object.keys(PLATFORMS), description: "Plateforme ciblée ou all." },
      }, required: ["query", "platform"] },
      write: false,
      label: (args) => `Rechercher sur ${str(args.platform, 30)} : ${str(args.query, 70)}`,
      run: async (args) => {
        const query = str(args.query, 300).trim();
        const platform = str(args.platform, 30);
        if (!query) return { error: "La requête est vide." };
        if (!(platform in PLATFORMS)) return { error: "Plateforme non prise en charge." };
        const scopedQuery = [PLATFORMS[platform], query].filter(Boolean).join(" ");
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
          body: JSON.stringify({ query: scopedQuery, search_depth: "advanced", max_results: 6, include_answer: false, include_raw_content: false }),
          signal: AbortSignal.timeout(15000), cache: "no-store",
        });
        if (!response.ok) return { error: `Le moteur de recherche a renvoyé HTTP ${response.status}.` };
        const payload = await response.json() as { results?: SearchResult[] };
        return {
          query: scopedQuery, scope: "contenus publics indexés",
          results: (payload.results ?? []).map((r) => ({ title: str(r.title, 300), url: str(r.url, 1000), excerpt: str(r.content, 1200) })),
          limitation: "Les résultats ne représentent pas l'ensemble du réseau et ne donnent pas accès aux données privées ou aux statistiques internes.",
        };
      },
    }] };
  },
};
