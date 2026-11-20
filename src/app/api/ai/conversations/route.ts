import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  isConversationInput,
  isConversationPayloadWithinLimit,
  MAX_CONVERSATIONS_PER_REQUEST,
} from "@/lib/ai/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserClient() {
  const supabase = await createServerSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Le stockage cloud Supabase n'est pas configuré." }, { status: 503 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Connecte-toi pour accéder à ton historique cloud." }, { status: 401 }) };
  return { supabase, user };
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`ai-conversations:${clientKey(request.headers)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de requêtes. Réessaie plus tard." }, { status: 429 });

  const auth = await getUserClient();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("bcx_ai_conversations")
    .select("id,title,messages,language,pinned,archived,updated_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("BCX conversation list failed:", error.message);
    return NextResponse.json({ error: "Impossible de charger l'historique cloud. Vérifie que la migration BCX Conversations est appliquée." }, { status: 503 });
  }
  return NextResponse.json({ conversations: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-conversations:${clientKey(request.headers)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de sauvegardes. Réessaie plus tard." }, { status: 429 });

  const auth = await getUserClient();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const conversations = Array.isArray(body.conversations) ? body.conversations : [body.conversation];
  if (conversations.length < 1 || conversations.length > MAX_CONVERSATIONS_PER_REQUEST || !conversations.every(isConversationInput)) {
    return NextResponse.json({ error: "Conversations invalides : vérifie les titres, messages et limites de taille." }, { status: 400 });
  }
  if (!isConversationPayloadWithinLimit(conversations)) {
    return NextResponse.json({ error: "Les conversations dépassent la taille maximale autorisée." }, { status: 413 });
  }

  const rows = conversations.map((conversation) => ({
    id: conversation.id,
    user_id: auth.user.id,
    title: conversation.title.trim(),
    messages: conversation.messages,
    language: conversation.language,
    pinned: conversation.pinned ?? false,
    archived: conversation.archived ?? false,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await auth.supabase.from("bcx_ai_conversations").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("BCX conversation save failed:", error.message);
    return NextResponse.json({ error: "Impossible d'enregistrer l'historique cloud." }, { status: 503 });
  }
  return NextResponse.json({ saved: rows.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const limit = rateLimit(`ai-conversations:${clientKey(request.headers)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de requêtes. Réessaie plus tard." }, { status: 429 });

  const auth = await getUserClient();
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return NextResponse.json({ error: "Identifiant de conversation invalide." }, { status: 400 });

  const { error: revokeError } = await auth.supabase.from("bcx_ai_shared_conversations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .eq("user_id", auth.user.id)
    .is("revoked_at", null);
  if (revokeError) {
    console.error("BCX share cleanup failed:", revokeError.message);
    return NextResponse.json({ error: "Impossible de révoquer les liens de partage de cette conversation." }, { status: 503 });
  }

  const { error } = await auth.supabase.from("bcx_ai_conversations").delete().eq("id", id).eq("user_id", auth.user.id);
  if (error) {
    console.error("BCX conversation delete failed:", error.message);
    return NextResponse.json({ error: "Impossible de supprimer cette conversation cloud." }, { status: 503 });
  }
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
