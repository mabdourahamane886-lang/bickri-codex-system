import { NextRequest, NextResponse } from "next/server";
import { getAgentContext } from "@/lib/agent/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveKnowledgeDocument } from "@/lib/ai/knowledge-ingestion";
import { collectPublicWebPage } from "@/lib/ai/web-ingestion";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const ctx = await getAgentContext();
  if (!ctx.user || !ctx.trusted) {
    return NextResponse.json({ error: "Connexion avec un compte administrateur/éditeur requise." }, { status: 403 });
  }

  let body: { url?: unknown; language?: unknown; title?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  if (typeof body.url !== "string" || body.url.length > 2048) {
    return NextResponse.json({ error: "Fournis une URL publique HTTP ou HTTPS valide." }, { status: 400 });
  }

  let page: { url: string; title: string; text: string };
  try { page = await collectPublicWebPage(body.url); } catch (error) {
    const message = error instanceof Error ? error.message : "Collecte de la page impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase n'est pas configuré." }, { status: 503 });
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 180) : page.title;
  try {
    const result = await saveKnowledgeDocument({
      supabase, title, content: page.text, sourceUrl: page.url,
      language: typeof body.language === "string" ? body.language.trim().slice(0, 12) || "fr" : "fr",
      createdBy: ctx.user.id,
    });
    return NextResponse.json({ ok: true, title, sourceUrl: page.url, extractedCharacters: page.text.length, ...result });
  } catch (error) {
    console.error("BCX web ingestion failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "La page a été collectée mais son enregistrement a échoué. Vérifie la migration et les droits éditeur." }, { status: 500 });
  }
}
