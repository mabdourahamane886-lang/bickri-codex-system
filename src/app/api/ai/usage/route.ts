import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-usage:${clientKey(request.headers)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Limite atteinte." }, { status: 429 });
  const auth = await createServerSupabase();
  if (!auth) return NextResponse.json({ error: "Supabase indisponible." }, { status: 503 });
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Télémétrie serveur non configurée." }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }
  const capability = typeof body.capability === "string" ? body.capability.slice(0, 80) : "";
  const outcome = ["success", "error", "blocked"].includes(String(body.outcome)) ? String(body.outcome) : "";
  if (!capability || !outcome) return NextResponse.json({ error: "Événement invalide." }, { status: 400 });
  const provider = typeof body.provider === "string" ? body.provider.slice(0, 80) : "Gemini";
  const latency = Number.isInteger(body.latencyMs) ? Math.max(0, Math.min(600000, Number(body.latencyMs))) : null;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from("bcx_ai_usage_events").insert({
    user_id: user.id, capability, provider, outcome, latency_ms: latency,
    error_code: typeof body.errorCode === "string" ? body.errorCode.slice(0, 100) : null,
  });
  if (error) {
    console.error("BCX usage telemetry insert failed", error.code);
    return NextResponse.json({ error: "Enregistrement de métrique impossible." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const auth = await createServerSupabase();
  if (!auth) return NextResponse.json({ error: "Supabase indisponible." }, { status: 503 });
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") return NextResponse.json({ error: "Accès administrateur requis." }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Télémétrie serveur non configurée." }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await admin.from("bcx_ai_usage_events").select("capability,provider,outcome,latency_ms,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
  if (error) return NextResponse.json({ error: "Lecture des statistiques impossible." }, { status: 503 });
  const events = data ?? [];
  const byCapability = Object.groupBy ? Object.groupBy(events, (e) => e.capability) : events.reduce((acc: Record<string, typeof events>, e) => ((acc[e.capability] ??= []).push(e), acc), {});
  const summary = Object.entries(byCapability).map(([capability, rows]) => ({
    capability, total: rows?.length ?? 0,
    successes: rows?.filter((e) => e.outcome === "success").length ?? 0,
    errors: rows?.filter((e) => e.outcome === "error").length ?? 0,
    averageLatencyMs: (() => { const values = rows?.map((e) => e.latency_ms).filter((n): n is number => typeof n === "number") ?? []; return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null; })(),
  }));
  return NextResponse.json({ periodDays: 30, totalEvents: events.length, summary }, { headers: { "Cache-Control": "no-store" } });
}
