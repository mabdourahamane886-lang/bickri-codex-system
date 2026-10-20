import "server-only";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: "Google" | "Tavily";
};

function clean(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Search configured providers on the server only. No API key is ever returned to the browser. */
export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
  const q = clean(query, 500);
  if (!q) return [];
  const max = Math.max(1, Math.min(limit, 8));
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  const tavilyKey = process.env.TAVILY_API_KEY;

  // Prefer Google Programmable Search when configured, then use Tavily as a web-search fallback.
  if (googleKey && googleCx) {
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", googleKey);
      url.searchParams.set("cx", googleCx);
      url.searchParams.set("q", q);
      url.searchParams.set("num", String(Math.min(max, 10)));
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { items?: Array<{ title?: string; link?: string; snippet?: string }> };
        const items = (payload.items ?? []).flatMap((item) => {
          const title = clean(item.title, 300);
          const link = clean(item.link, 1000);
          if (!title || !/^https?:\/\//i.test(link)) return [];
          return [{ title, url: link, snippet: clean(item.snippet), source: "Google" as const }];
        });
        if (items.length) return items.slice(0, max);
      } else {
        console.warn("BCX Google Search failed:", response.status);
      }
    } catch (error) {
      console.warn("BCX Google Search unavailable:", error instanceof Error ? error.message : "unknown");
    }
  }

  if (tavilyKey) {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query: q, search_depth: "basic", max_results: max, include_answer: false, include_raw_content: false }),
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (response.ok) {
        const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
        return (payload.results ?? []).flatMap((item) => {
          const title = clean(item.title, 300);
          const url = clean(item.url, 1000);
          if (!title || !/^https?:\/\//i.test(url)) return [];
          return [{ title, url, snippet: clean(item.content), source: "Tavily" as const }];
        }).slice(0, max);
      }
      console.warn("BCX Tavily Search failed:", response.status);
    } catch (error) {
      console.warn("BCX Tavily Search unavailable:", error instanceof Error ? error.message : "unknown");
    }
  }
  return [];
}

export function formatWebSearchResults(results: WebSearchResult[]): string {
  if (!results.length) return "";
  return results.map((item, index) =>
    `[SOURCE WEB ${index + 1} — ${item.title} | fournisseur : ${item.source}]\nURL : ${item.url}\nExtrait : ${item.snippet}`
  ).join("\n\n");
}

export function isWebSearchConfigured(): boolean {
  return Boolean((process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) || process.env.TAVILY_API_KEY);
}

/** Search automatically for explicit research requests and time-sensitive questions. */
export function shouldSearchWeb(query: string): boolean {
  return /\b(recherche|recherches|cherche sur|sur internet|sur le web|sources?|références?|actualit[eé]s?|aujourd'hui|aujourd’hui|actuellement|récemment|dernier(?:e|s|es)?|latest|current|recent|news|prix actuel|météo|taux de change|compare les sites|vérifie en ligne|google)\b/i.test(query);
}
