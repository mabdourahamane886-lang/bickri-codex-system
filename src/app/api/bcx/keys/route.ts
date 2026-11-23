import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { bcxAdminDb, createBcxKey, BCX_KEY_SCOPE } from "@/lib/bcx-api-keys";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function context() {
  const session = await createServerSupabase();
  const db = bcxAdminDb();
  if (!session || !db) return { error: "BCX API Keys non configuré.", status: 503 } as const;
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { error: "Connexion requise.", status: 401 } as const;
  return { user, db };
}

export async function GET() {
  const ctx = await context();
  if ("error" in ctx) return response({ error: ctx.error }, ctx.status);
  const { data, error } = await ctx.db.from("bcx_api_keys")
    .select("id,name,key_prefix,scopes,created_at,expires_at,revoked_at,last_used_at")
    .eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(100);
  return error ? response({ error: "Impossible de charger les clés." }, 503) : response({ keys: data ?? [] });
}

export async function POST(request: NextRequest) {
  const limit = rateLimit("bcx-key-create:" + clientKey(request.headers), 5, 60_000);
  if (!limit.ok) return response({ error: "Trop de créations de clés." }, 429);
  const ctx = await context();
  if ("error" in ctx) return response({ error: ctx.error }, ctx.status);
  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: "JSON invalide." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Données invalides." }, 400);
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (!name) return response({ error: "Indique un nom pour la clé." }, 400);
  if (input.expiresInDays !== undefined && (!Number.isInteger(input.expiresInDays) || Number(input.expiresInDays) < 1 || Number(input.expiresInDays) > 365))
    return response({ error: "Expiration : de 1 à 365 jours." }, 400);
  const expiresAt = new Date(Date.now() + Number(input.expiresInDays ?? 90) * 86400_000).toISOString();
  const { key, hash, prefix } = createBcxKey();
  const { data, error } = await ctx.db.from("bcx_api_keys").insert({
    user_id: ctx.user.id, name, key_hash: hash, key_prefix: prefix,
    scopes: [BCX_KEY_SCOPE], expires_at: expiresAt,
  }).select("id,name,key_prefix,scopes,created_at,expires_at").single();
  if (error) return response({ error: "Création impossible. Vérifie la migration de la base BCX." }, 503);
  // Plaintext key is returned once, never persisted or logged.
  return response({ key, metadata: data, warning: "Copie la clé maintenant ; elle ne sera plus affichée." }, 201);
}

export async function DELETE(request: NextRequest) {
  const ctx = await context();
  if ("error" in ctx) return response({ error: ctx.error }, ctx.status);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return response({ error: "Identifiant invalide." }, 400);
  const { data, error } = await ctx.db.from("bcx_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", ctx.user.id).is("revoked_at", null)
    .select("id").maybeSingle();
  if (error) return response({ error: "Révocation impossible." }, 503);
  return data ? response({ revoked: true }) : response({ error: "Clé introuvable ou déjà révoquée." }, 404);
}
