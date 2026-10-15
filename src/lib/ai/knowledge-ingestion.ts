import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const KNOWLEDGE_CHUNK_SIZE = 3200;
export const EMBEDDING_DIMENSIONS = 768;

export function chunkKnowledgeText(value: string, size = KNOWLEDGE_CHUNK_SIZE): string[] {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf("\n\n", end);
      const sentence = normalized.lastIndexOf(". ", end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > start + Math.floor(size * 0.55)) end = boundary + 1;
    }
    const part = normalized.slice(start, end).trim();
    if (part) chunks.push(part);
    start = end;
  }
  return chunks;
}

export function stableDocumentId(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Gemini embeddings use the same server-side key as the configured Gemini provider. */
export async function embedTexts(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"): Promise<number[][] | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey || !texts.length) return null;

  const model = process.env.BCX_EMBEDDING_MODEL || "gemini-embedding-001";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
          taskType,
        })),
      }),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const error = new Error(`Gemini embedding HTTP ${response.status}`);
    console.warn("BCX embedding provider unavailable:", response.status);
    throw error;
  }

  const payload = await response.json() as { embeddings?: Array<{ values?: number[] }> };
  const embeddings = payload.embeddings?.map((item) => item.values ?? []);
  if (!embeddings || embeddings.length !== texts.length ||
      embeddings.some((values) => values.length !== EMBEDDING_DIMENSIONS || values.some((n) => !Number.isFinite(n)))) {
    throw new Error("Le fournisseur d'embeddings a renvoyé un format inattendu.");
  }
  return embeddings;
}

export async function saveKnowledgeDocument(input: {
  supabase: SupabaseClient;
  title: string;
  content: string;
  sourceUrl: string;
  language: string;
  createdBy: string;
}): Promise<{ chunks: number; vectorized: number }> {
  const chunks = chunkKnowledgeText(input.content);
  if (!chunks.length) throw new Error("Le document ne contient aucun texte exploitable.");

  // Keep batches modest to respect provider request and server execution limits.
  const embeddings: number[][] = [];
  let vectorized = false;
  try {
    for (let i = 0; i < chunks.length; i += 16) {
      const batch = await embedTexts(chunks.slice(i, i + 16));
      if (!batch) break;
      embeddings.push(...batch);
      vectorized = true;
    }
  } catch (error) {
    // Do not silently claim semantic search is ready; preserve keyword-search ingestion.
    console.warn("BCX document stored without complete embeddings:", error instanceof Error ? error.message : "unknown");
    embeddings.length = 0;
    vectorized = false;
  }

  const rows = chunks.map((content, chunk_index) => ({
    title: input.title,
    source_url: input.sourceUrl,
    language: input.language || "fr",
    chunk_index,
    content,
    is_public: true,
    created_by: input.createdBy,
    embedding: vectorized ? `[${embeddings[chunk_index].join(",")}]` : null,
  }));

  const { error } = await input.supabase
    .from("bcx_knowledge_chunks")
    .upsert(rows, { onConflict: "source_url,chunk_index" });
  if (error) throw new Error(`Enregistrement de la bibliothèque impossible (${error.code}).`);

  // Remove old tail chunks when a source is re-imported with shorter content.
  const { error: cleanupError } = await input.supabase
    .from("bcx_knowledge_chunks")
    .delete()
    .eq("source_url", input.sourceUrl)
    .gte("chunk_index", chunks.length);
  if (cleanupError) console.warn("BCX stale chunk cleanup failed:", cleanupError.code);

  return { chunks: chunks.length, vectorized: vectorized ? chunks.length : 0 };
}
