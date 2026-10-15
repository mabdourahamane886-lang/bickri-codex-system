import { NextRequest, NextResponse } from "next/server";
import { getAgentContext } from "@/lib/agent/context";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function chunkText(value: string, size = 3200): string[] {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;\n  while (start < normalized.length) {
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

/** Store supplied text as searchable knowledge chunks. Only trusted editors may ingest documents. */
export async function POST(request: NextRequest) {
  const ctx = await getAgentContext();
  if (!ctx.user || !ctx.trusted) {
    return NextResponse.json({ error: "Connexion avec un compte administrateur/éditeur requise." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 180) : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const language = typeof body.language === "string" ? body.language.trim().slice(0, 12) : "fr";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim().slice(0, 1500) : null;

  if (!title || content.length < 80) {
    return NextResponse.json({ error: "Fournis un titre et au moins 80 caractères de contenu textuel." }, { status: 400 });
  }
  if (content.length > 100_000) {
    return NextResponse.json({ error: "Le document dépasse la limite de 100 000 caractères." }, { status: 413 });
  }
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("invalid protocol");
    } catch {
      return NextResponse.json({ error: "L'adresse source doit être une URL HTTP ou HTTPS valide." }, { status: 400 });
    }
  }

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase n'est pas configuré." }, { status: 503 });

  const chunks = chunkText(content);
  const rows = chunks.map((text, chunk_index) => ({
    title,
    source_url: sourceUrl,
    language: language || "fr",
    chunk_index,
    content: text,
    is_public: true,
    created_by: ctx.user!.id,
  }));

  const { data, error } = await supabase
    .from("bcx_knowledge_chunks")
    .upsert(rows, { onConflict: "source_url,chunk_index" })
    .select("id");

  if (error) {
    console.error("BCX knowledge ingestion failed:", error.code);
    return NextResponse.json({
      error: "Impossible d'enregistrer le document. Vérifie que la migration RAG a été appliquée et que le compte dispose des droits éditeur.",
      code: "KNOWLEDGE_INGEST_FAILED",
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, title, chunks: data?.length ?? rows.length });
}
