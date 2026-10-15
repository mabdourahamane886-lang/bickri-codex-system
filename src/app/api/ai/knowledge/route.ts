import { NextRequest, NextResponse } from "next/server";
import { getAgentContext } from "@/lib/agent/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveKnowledgeDocument } from "@/lib/ai/knowledge-ingestion";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Importer du texte existant dans la bibliothèque BCX, avec embeddings si Gemini est configuré. */
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
  const language = typeof body.language === "string" ? body.language.trim().slice(0, 12) || "fr" : "fr";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim().slice(0, 1500) : "";

  if (!title || content.length < 80) return NextResponse.json({ error: "Fournis un titre et au moins 80 caractères de contenu." }, { status: 400 });
  if (content.length > 100_000) return NextResponse.json({ error: "Le document dépasse 100 000 caractères." }, { status: 413 });
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) throw new Error("invalid URL");
    } catch { return NextResponse.json({ error: "L'adresse source doit être une URL HTTP/HTTPS valide." }, { status: 400 }); }
  }

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase n'est pas configuré." }, { status: 503 });
  try {
    const result = await saveKnowledgeDocument({
      supabase, title, content, sourceUrl: sourceUrl || `text://${encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-").slice(0, 120))}`,
      language, createdBy: ctx.user.id,
    });
    return NextResponse.json({ ok: true, title, ...result });
  } catch (error) {
    console.error("BCX knowledge ingestion failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Impossible d'enregistrer le document. Vérifie les migrations et les droits éditeur.", code: "KNOWLEDGE_INGEST_FAILED" }, { status: 500 });
  }
}
