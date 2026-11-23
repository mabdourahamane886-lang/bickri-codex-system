import { NextRequest, NextResponse } from "next/server";
import { authenticateBcxKey, BCX_KEY_SCOPE } from "@/lib/bcx-api-keys";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateBcxKey(request, BCX_KEY_SCOPE);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
  // Best effort limit per running instance; production needs a shared global quota.
  const limit = rateLimit("bcx-memory-key:" + auth.keyId, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Limite temporaire atteinte." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const { data, error } = await auth.db.from("bcx_ai_memories")
    .select("id,title,content,category,created_at,updated_at")
    .eq("user_id", auth.userId).order("updated_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Mémoire BCX indisponible." }, { status: 503 });
  return NextResponse.json({ memories: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
