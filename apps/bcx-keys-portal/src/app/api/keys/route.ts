import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
async function context(req: NextRequest) {
  const db = admin();
  if (!db) return { error: "Portail non configuré.", status: 503 } as const;
  const token = /^Bearer (\S+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return { error: "Authentification requise.", status: 401 } as const;
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { error: "Session invalide.", status: 401 } as const;
  return { db, user };
}
export async function GET(req: NextRequest) {
  const ctx = await context(req);
  if ("error" in ctx) return json({ error: ctx.error }, ctx.status);
  const { data, error } = await ctx.db.from("bcx_api_keys").select("id,name,key_prefix,scopes,created_at,expires_at,revoked_at,last_used_at")
    .eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(100);
  return error ? json({ error: "Lecture des clés impossible." }, 503) : json({ keys: data ?? [] });
}
export async function POST(req: NextRequest) {
  const ctx = await context(req);
  if ("error" in ctx) return json({ error: ctx.error }, ctx.status);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Données invalides." }, 400);
  const { name, expiresInDays } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.length > 80) return json({ error: "Nom invalide (1–80 caractères)." }, 400);
  if (typeof expiresInDays !== "number" || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)
    return json({ error: "Expiration : 1 à 365 jours." }, 400);
  const { count, error: countError } = await ctx.db.from("bcx_api_keys").select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id).is("revoked_at", null);
  if (countError) return json({ error: "Vérification du quota impossible." }, 503);
  if ((count ?? 0) >= 10) return json({ error: "Maximum de 10 clés actives." }, 429);
  const key = "bcx_sk_" + randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(key).digest("hex");
  const { data, error } = await ctx.db.from("bcx_api_keys").insert({
    user_id: ctx.user.id, name: name.trim(), key_hash: hash, key_prefix: key.slice(0,19),
    scopes: ["memory:read"], expires_at: new Date(Date.now() + expiresInDays * 86400_000).toISOString(),
  }).select("id,name,key_prefix,scopes,created_at,expires_at").single();
  return error ? json({ error: "Enregistrement impossible : vérifie la migration." }, 503)
    : json({ key, metadata: data, warning: "Cette clé n'est affichée qu'une seule fois." }, 201);
}
export async function DELETE(req: NextRequest) {
  const ctx = await context(req);
  if ("error" in ctx) return json({ error: ctx.error }, ctx.status);
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: "ID invalide." }, 400);
  const { data, error } = await ctx.db.from("bcx_api_keys").update({ revoked_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", ctx.user.id).is("revoked_at", null).select("id").maybeSingle();
  if (error) return json({ error: "Révocation impossible." }, 503);
  return data ? json({ revoked: true }) : json({ error: "Clé introuvable." }, 404);
}
