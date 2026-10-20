import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-feedback:${clientKey(request.headers)}`, 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de retours envoyés. Réessaie plus tard." }, { status: 429 });

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Le stockage Supabase n'est pas configuré." }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Connecte-toi pour envoyer un retour." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 }); }

  const rating = body.rating === 1 || body.rating === -1 ? body.rating : null;
  if (!rating) return NextResponse.json({ error: "La note doit être 1 ou -1." }, { status: 400 });
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 60) || "general" : "general";
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : null;
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.slice(0, 120) : null;

  const { data, error } = await supabase.from("bcx_ai_feedback").insert({
    user_id: user.id, rating, category, comment, conversation_id: conversationId,
  }).select("id, created_at").single();

  if (error) {
    console.error("BCX feedback insert failed", error.code);
    return NextResponse.json({ error: "Impossible d'enregistrer le retour. Vérifie que la migration BCX est appliquée." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, feedback: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
