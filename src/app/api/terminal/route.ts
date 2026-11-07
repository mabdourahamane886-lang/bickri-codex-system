import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sandboxFetch } from "@/lib/sandbox/client";

export const runtime = "nodejs";
export const maxDuration = 60;

async function authenticatedUser() {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour utiliser le terminal cloud." }, { status: 401 });
  const limit = rateLimit("terminal:" + user.id, 40, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de commandes. Réessaie plus tard." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4_000_000) return NextResponse.json({ error: "Projet trop volumineux pour le terminal." }, { status: 413 });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const action = body.action;
  if (action === "open") {
    if (!Array.isArray(body.files) || body.files.length > 300) return NextResponse.json({ error: "Fichiers du projet invalides." }, { status: 400 });
    try {
      const response = await sandboxFetch("/terminal/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: user.id, files: body.files }),
      });
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(data, { status: response.status });
    } catch {
      return NextResponse.json({ error: "Le service de terminal BCX est indisponible. Vérifie le runner." }, { status: 503 });
    }
  }

  if (action === "command") {
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !command || command.length > 4000) {
      return NextResponse.json({ error: "Commande ou session invalide." }, { status: 400 });
    }
    try {
      const response = await sandboxFetch("/terminal/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: user.id, sessionId, command, timeoutMs: 30_000 }),
      }, 35_000);
      return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
    } catch {
      return NextResponse.json({ error: "La commande a expiré ou le terminal est indisponible." }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "Action terminal inconnue." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: "Session invalide." }, { status: 400 });
  try {
    const response = await sandboxFetch("/terminal/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId: user.id, sessionId }),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Impossible de fermer la session." }, { status: 503 });
  }
}
