import "server-only";
import type { AgentContext } from "@/lib/agent/types";

type StoredMemory = {
  title?: string;
  content?: string;
  category?: string;
  updated_at?: string;
};

const STOP_WORDS = new Set([
  "avec", "dans", "pour", "mais", "donc", "cette", "cela", "comment", "pourquoi",
  "faire", "fait", "veux", "mon", "mes", "une", "des", "les", "the", "and",
  "that", "this", "from", "your",
]);

export function formatAuthorizedMemory(memories: StoredMemory[], query: string): string {
  const queryTerms = query.toLocaleLowerCase("fr").normalize("NFD")
    .replace(/\p{M}/gu, "").match(/[a-z0-9]{3,}/g) ?? [];
  const terms = [...new Set(queryTerms.filter((term) => !STOP_WORDS.has(term)))].slice(0, 24);
  const ranked = memories.map((memory) => {
    const title = String(memory.title || "").toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");
    const content = String(memory.content || "").toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");
    const category = String(memory.category || "general").toLocaleLowerCase("fr");
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 3 : 0) + (content.includes(term) ? 1 : 0) + (category.includes(term) ? 0.5 : 0), 0);
    const updatedAt = memory.updated_at ? Date.parse(memory.updated_at) : Number.NaN;
    const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86_400_000) : 365;
    return { memory, score, recency: Math.max(0, 365 - ageDays) };
  }).sort((a, b) => b.score - a.score || b.recency - a.recency);
  const selected = ranked.filter((item) => item.score > 0).slice(0, 8);
  const fallback = selected.length ? selected : ranked.slice(0, 3);
  return fallback.map(({ memory }) =>
    `[${String(memory.category || "general").slice(0, 40)} | mise à jour : ${String(memory.updated_at || "date inconnue").slice(0, 10)}] ${String(memory.title || "").slice(0, 120)}: ${String(memory.content || "").slice(0, 1200)}`)
    .join("\n")
    .slice(0, 10000);
}

export async function loadAuthorizedMemory(ctx: AgentContext, query: string): Promise<string> {
  if (!ctx.user || !ctx.supabase) return "";
  try {
    const { data, error } = await ctx.supabase
      .from("bcx_ai_memories")
      .select("title,content,category,updated_at")
      .eq("user_id", ctx.user.id)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) {
      console.error("BCX memory context read failed", error.code);
      return "";
    }
    return formatAuthorizedMemory((data ?? []) as StoredMemory[], query);
  } catch (error) {
    console.error("BCX memory context unavailable", error instanceof Error ? error.message : "unknown");
    return "";
  }
}
