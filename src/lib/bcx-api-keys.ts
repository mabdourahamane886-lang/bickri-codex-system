import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export const BCX_KEY_SCOPE = "memory:read" as const;
export const BCX_KEY_PATTERN = /^bcx_sk_[a-f0-9]{64}$/;

export function createBcxKey() {
  const key = "bcx_sk_" + randomBytes(32).toString("hex");
  return { key, hash: hashBcxKey(key), prefix: key.slice(0, 19) };
}
export function hashBcxKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Server-side only. Never import into a client component or expose the service secret. */
export function bcxAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticateBcxKey(req: NextRequest, scope: typeof BCX_KEY_SCOPE) {
  const authorization = req.headers.get("authorization") || "";
  const match = /^Bearer (\S+)$/i.exec(authorization);
  const key = match?.[1] || "";
  if (!BCX_KEY_PATTERN.test(key)) return { ok: false as const, status: 401, error: "Clé BCX absente ou invalide." };
  const db = bcxAdminDb();
  if (!db) return { ok: false as const, status: 503, error: "Stockage sécurisé BCX non configuré." };
  const { data, error } = await db.from("bcx_api_keys")
    .select("id,user_id,scopes,expires_at,revoked_at")
    .eq("key_hash", hashBcxKey(key)).maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "Vérification de la clé indisponible." };
  if (!data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now()))
    return { ok: false as const, status: 401, error: "Clé BCX expirée, révoquée ou inconnue." };
  if (!Array.isArray(data.scopes) || !data.scopes.includes(scope))
    return { ok: false as const, status: 403, error: "Permission insuffisante." };
  // Last usage is non-critical: never delay an authorized request for telemetry.
  void db.from("bcx_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(
    () => undefined, () => undefined,
  );
  return { ok: true as const, db, userId: data.user_id as string, keyId: data.id as string };
}
