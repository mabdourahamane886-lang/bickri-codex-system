import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** Client navigateur unique. Lève une erreur explicite si Supabase n'est pas configuré. */
export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase n'est pas configuré. Ajoute NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans les variables d'environnement.");
  }
  cached ??= createBrowserClient(url, key);
  return cached;
}

/** Variante qui renvoie null au lieu de lever une erreur (mode local). */
export function getClientOrNull(): SupabaseClient | null {
  return isSupabaseConfigured() ? createClient() : null;
}
