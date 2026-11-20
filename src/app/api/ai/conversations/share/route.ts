import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserClient() {
  const supabase = await createServerSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Le partage nécessite une configuration Supabase." }, { status: 503 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Connecte-toi pour partager une conversation." }, { status: 401 }) };
  return { supabase, user };
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-share:${clientKey(request.headers)}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de liens de partage créés. Réessaie plus tard." }, { status: 429 });
  const auth = await getUserClient();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).conversationId !== "string") {
    return NextResponse.json({ error: "Identifiant de conversation invalide." }, { status: 400 });
  }
  const conversationId = (body as Record<string, unknown>).conversationId as string;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(conversationId)) return NextResponse.json({ error: "Identifiant de conversation invalide." }, { status: 400 });

  const { data: conversation, error: conversationError } = await auth.supabase
    .from("bcx_ai_conversations")
    .select("id,title,messages")
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (conversationError) {
    console.error("BCX share source lookup failed:", conversationError.message);
    return NextResponse.json({ error: "Impossible de préparer le partage." }, { status: 503 });
  }
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable. Vérifie qu'elle est synchronisée dans ton compte." }, { status: 404 });

  const token = randomBytes(32).toString("base64url");
  const { error } = await auth.supabase.from("bcx_ai_shared_conversations").upsert({
    user_id: auth.user.id,
    conversation_id: conversation.id,
    token,
    title: conversation.title,
    messages: conversation.messages,
    revoked_at: null,
  }, { onConflict: "user_id,conversation_id" });
  if (error) {
    console.error("BCX share creation failed:", error.message);
    return NextResponse.json({ error: "Impossible de créer le lien de partage." }, { status: 503 });
  }
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const limit = rateLimit(`ai-share:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de requêtes. Réessaie plus tard." }, { status: 429 });
  const auth = await getUserClient();
  if ("error" in auth) return auth.error;
  const conversationId = request.nextUrl.searchParams.get("conversationId") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(conversationId)) return NextResponse.json({ error: "Identifiant de conversation invalide." }, { status: 400 });

  const { error } = await auth.supabase.from("bcx_ai_shared_conversations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", auth.user.id)
    .is("revoked_at", null);
  if (error) {
    console.error("BCX share revoke failed:", error.message);
    return NextResponse.json({ error: "Impossible de révoquer le lien." }, { status: 503 });
  }
  return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
}
