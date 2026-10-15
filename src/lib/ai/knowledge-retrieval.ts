import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/ai/knowledge-ingestion";

export type RetrievedKnowledge = {
  title: string;
  source_url: string | null;
  language: string;
  content: string;
  similarity?: number;
};

/** Prefer semantic retrieval; fall back to PostgreSQL full-text search when embeddings are unavailable. */
export async function retrieveKnowledge(query: string, limit = 5): Promise<RetrievedKnowledge[]> {
  const supabase = await createServerSupabase();
  if (!supabase) return [];
  const boundedLimit = Math.max(1, Math.min(limit, 8));

  try {
    const [embedding] = await embedTexts([query], "RETRIEVAL_QUERY") ?? [];
    if (embedding?.length === 768) {
      const vector = `[${embedding.join(",")}]`;
      const { data, error } = await supabase.rpc("match_bcx_knowledge", {
        query_embedding: vector,
        match_count: boundedLimit,
        min_similarity: 0.2,
      });
      if (!error && data?.length) return data as RetrievedKnowledge[];
      if (error) console.warn("BCX vector retrieval unavailable; using keyword search:", error.code);
    }
  } catch (error) {
    console.warn("BCX query embedding unavailable; using keyword search:", error instanceof Error ? error.message : "unknown");
  }

  const terms = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word, index, all) => all.indexOf(word) === index)
    .slice(0, 10);
  if (!terms.length) return [];

  const { data, error } = await supabase
    .from("bcx_knowledge_chunks")
    .select("title, source_url, language, content")
    .eq("is_public", true)
    .textSearch("search_vector", terms.join(" OR "), { config: "simple", type: "websearch" })
    .limit(boundedLimit);

  if (error) {
    console.warn("BCX knowledge retrieval unavailable:", error.code);
    return [];
  }
  return (data ?? []) as RetrievedKnowledge[];
}

export function formatRetrievedKnowledge(items: RetrievedKnowledge[]): string {
  if (!items.length) return "";
  return items.map((item, index) => {
    const source = item.source_url ? `\nSource : ${item.source_url}` : "";
    const score = typeof item.similarity === "number" ? ` | pertinence : ${item.similarity.toFixed(2)}` : "";
    return `[DOCUMENT RÉCUPÉRÉ ${index + 1} — ${item.title} | langue : ${item.language}${score}]${source}\n${item.content.slice(0, 5000)}`;
  }).join("\n\n");
}
