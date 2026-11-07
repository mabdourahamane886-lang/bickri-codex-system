import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sandboxFetch } from "@/lib/sandbox/client";

export const runtime = "nodejs";
export const maxDuration = 60;

async function getUser() {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour compiler un projet Flutter." }, { status: 401 });
  const limit = rateLimit("flutter-build:" + user.id, 2, 30 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Limite de compilation atteinte. Réessaie plus tard." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8_500_000) return NextResponse.json({ error: "Projet trop volumineux. Limite : 8 Mo." }, { status: 413 });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSON");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }
  if (!Array.isArray(body.files) || !body.files.some((f) => f && typeof f === "object" && (f as {path?: string; name?: string}).path === "pubspec.yaml" || f && typeof f === "object" && (f as {name?: string}).name === "pubspec.yaml")) {
    return NextResponse.json({ error: "Le projet doit contenir pubspec.yaml." }, { status: 400 });
  }
  const target = body.target === "aab" ? "aab" : "apk";
  try {
    const response = await sandboxFetch("/build/flutter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId: user.id, files: body.files, target }),
    }, 25_000);
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Le service de compilation Flutter est indisponible." }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const buildId = request.nextUrl.searchParams.get("buildId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(buildId)) return NextResponse.json({ error: "Identifiant de build invalide." }, { status: 400 });
  try {
    const response = await sandboxFetch("/build/flutter/" + buildId, {
      method: "GET",
      headers: { "x-bcx-owner": user.id },
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Impossible de récupérer le statut du build." }, { status: 503 });
  }
}
