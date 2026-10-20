import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`ai-memories-read:${clientKey(request.headers)}`, 30, 60_000);
  if (!limit.ok) return jsonError("Trop de demandes. Réessaie dans un instant.", 429);

  const supabase = await createServerSupabase();
  if (!supabase) return jsonError("Le stockage Supabase n'est pas configuré.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Connecte-toi pour consulter ta mémoire.", 401);

  const { data, error } = await supabase
    .from("bcx_ai_memories")
    .select("id,title,content,category,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("BCX memories read failed", error.code);
    return jsonError("Impossible de charger la mémoire. Vérifie que la migration BCX est appliquée.", 503);
  }
  return NextResponse.json({ memories: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-memories-write:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) return jsonError("Trop de modifications. Réessaie dans un instant.", 429);

  const supabase = await createServerSupabase();
  if (!supabase) return jsonError("Le stockage Supabase n'est pas configuré.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Connecte-toi pour enregistrer un souvenir.", 401);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError("Corps JSON invalide.", 400); }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 4000) : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 40) || "general" : "general";
  if (!title || !content) return jsonError("Le titre et le contenu sont obligatoires.", 400);

  const { data, error } = await supabase
    .from("bcx_ai_memories")
    .insert({ user_id: user.id, title, content, category })
    .select("id,title,content,category,created_at,updated_at")
    .single();

  if (error) {
    console.error("BCX memories insert failed", error.code);
    return jsonError("Impossible d'enregistrer ce souvenir.", 503);
  }
  return NextResponse.json({ memory: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
