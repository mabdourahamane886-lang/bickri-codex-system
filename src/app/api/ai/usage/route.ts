import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const byCapability = events.reduce((acc: Record<string, typeof events>, e) => ((acc[e.capability] ??= []).push(e), acc), {});
  const summary = Object.entries(byCapability).map(([capability, rows]) => ({
    capability, total: rows?.length ?? 0,
    successes: rows?.filter((e) => e.outcome === "success").length ?? 0,
    errors: rows?.filter((e) => e.outcome === "error").length ?? 0,
    averageLatencyMs: (() => { const values = rows?.map((e) => e.latency_ms).filter((n): n is number => typeof n === "number") ?? []; return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null; })(),
  }));
  return NextResponse.json({ periodDays: 30, totalEvents: events.length, summary }, { headers: { "Cache-Control": "no-store" } });
}
