import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { queueMemoryCapture } from "@/lib/ai/memory-capture";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-memory-capture:${clientKey(request.headers)}`, 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de demandes de mémorisation." }, { status: 429 });
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ captured: 0, reason: "local-only" }, { status: 200 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ captured: 0, reason: "not-authenticated" }, { status: 200 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";
  try {
    const queued = await queueMemoryCapture(supabase, message);
    return NextResponse.json({ queued }, { status: queued ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("BCX memory enqueue failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "La mise en file d’attente de la mémoire a échoué." }, { status: 503 });
  }
}
