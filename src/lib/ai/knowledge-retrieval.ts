import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type RetrievedKnowledge = {
  title: string;
  source_url: string | null;
  language: string;
  content: string;
};

/**
 * Retrieve relevant approved/public knowledge chunks using PostgreSQL full-text search.
 * This is the retrieval stage of a lightweight RAG pipeline; document text remains untrusted.
 */
export async function retrieveKnowledge(query: string, limit = 5): Promise<RetrievedKnowledge[]> {
  const supabase = await createServerSupabase();
  if (!supabase) return [];

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
  const searchQuery = terms.join(" OR ");
  const { data, error } = await supabase
    .from("bcx_knowledge_chunks")
    .select("title, source_url, language, content")
    .eq("is_public", true)
    .textSearch("search_vector", searchQuery, { config: "simple", type: "websearch" })
    .limit(Math.max(1, Math.min(limit, 8)));

  if (error) {
    // The knowledge library is optional until its SQL migration has been applied.
    console.warn("BCX knowledge retrieval unavailable:", error.code);
    return [];
  }
  return (data ?? []) as RetrievedKnowledge[];
}

export function formatRetrievedKnowledge(items: RetrievedKnowledge[]): string {
  if (!items.length) return "";
  return items.map((item, index) => {
    const source = item.source_url ? `\nSource : ${item.source_url}` : "";
    return `[DOCUMENT RÉCUPÉRÉ ${index + 1} — ${item.title} | langue : ${item.language}]${source}\n${item.content.slice(0, 5000)}`;
  }).join("\n\n");
}
