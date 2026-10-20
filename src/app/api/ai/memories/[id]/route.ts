import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getUser(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return { supabase: null, user: null };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null };
  return { supabase, user };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const limit = rateLimit(`ai-memory-edit:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) return jsonError("Trop de modifications. Réessaie plus tard.", 429);
  const { supabase, user } = await getUser(request);
  if (!supabase) return jsonError("Le stockage Supabase n'est pas configuré.", 503);
  if (!user) return jsonError("Connecte-toi pour modifier ce souvenir.", 401);

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return jsonError("Identifiant de souvenir invalide.", 400);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError("Corps JSON invalide.", 400); }
  const update: Record<string, string> = {};
  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, 120);
    if (!title) return jsonError("Le titre ne peut pas être vide.", 400);
    update.title = title;
  }
  if (typeof body.content === "string") {
    const content = body.content.trim().slice(0, 4000);
    if (!content) return jsonError("Le contenu ne peut pas être vide.", 400);
    update.content = content;
  }
  if (typeof body.category === "string") update.category = body.category.trim().slice(0, 40) || "general";
  if (!Object.keys(update).length) return jsonError("Aucune modification fournie.", 400);

  const { data, error } = await supabase
    .from("bcx_ai_memories")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,title,content,category,created_at,updated_at")
    .maybeSingle();

  if (error) {
    console.error("BCX memory update failed", error.code);
    return jsonError("Impossible de modifier ce souvenir.", 503);
  }
  if (!data) return jsonError("Souvenir introuvable.", 404);
  return NextResponse.json({ memory: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const limit = rateLimit(`ai-memory-delete:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) return jsonError("Trop de suppressions. Réessaie plus tard.", 429);
  const { supabase, user } = await getUser(request);
  if (!supabase) return jsonError("Le stockage Supabase n'est pas configuré.", 503);
  if (!user) return jsonError("Connecte-toi pour supprimer ce souvenir.", 401);

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return jsonError("Identifiant de souvenir invalide.", 400);
  }

  const { data, error } = await supabase
    .from("bcx_ai_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("BCX memory delete failed", error.code);
    return jsonError("Impossible de supprimer ce souvenir.", 503);
  }
  if (!data) return jsonError("Souvenir introuvable.", 404);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
