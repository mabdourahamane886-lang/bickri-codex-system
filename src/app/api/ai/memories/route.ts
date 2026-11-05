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


export async function PATCH(request: NextRequest) {
  const limit = rateLimit(`ai-memories-write:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) return jsonError("Trop de modifications. Réessaie dans un instant.", 429);
  const supabase = await createServerSupabase();
  if (!supabase) return jsonError("Le stockage Supabase n'est pas configuré.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Connecte-toi pour modifier ta mémoire.", 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError("Corps JSON invalide.", 400); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return jsonError("Identifiant invalide.", 400);
  const patch: Record<string, string> = {};
  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, 120);
    if (!title) return jsonError("Le titre est obligatoire.", 400);
    patch.title = title;
  }
  if (typeof body.content === "string") {
    const content = body.content.trim().slice(0, 4000);
    if (!content) return jsonError("Le contenu est obligatoire.", 400);
    patch.content = content;
  }
  if (typeof body.category === "string") patch.category = body.category.trim().slice(0, 40) || "general";
  if (!Object.keys(patch).length) return jsonError("Aucune modification fournie.", 400);
  const { data, error } = await supabase.from("bcx_ai_memories").update(patch)
    .eq("id", id).eq("user_id", user.id)
    .select("id,title,content,category,created_at,updated_at").maybeSingle();
  if (error) {
    console.error("BCX memories update failed", error.code);
    return jsonError("Impossible de modifier ce souvenir.", 503);
  }
  if (!data) return jsonError("Souvenir introuvable.", 404);
  return NextResponse.json({ memory: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const limit = rateLimit(`ai-memories-write:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) return jsonError("Trop de modifications. Réessaie dans un instant.", 429);
  const supabase = await createServerSupabase();
  if (!supabase) return jsonError("Le stockage Supabase n'est pas configuré.", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Connecte-toi pour supprimer un souvenir.", 401);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return jsonError("Identifiant invalide.", 400);
  const { data, error } = await supabase.from("bcx_ai_memories").delete()
    .eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) {
    console.error("BCX memories delete failed", error.code);
    return jsonError("Impossible de supprimer ce souvenir.", 503);
  }
  if (!data) return jsonError("Souvenir introuvable.", 404);
  return NextResponse.json({ ok: true, id }, { headers: { "Cache-Control": "no-store" } });
}
