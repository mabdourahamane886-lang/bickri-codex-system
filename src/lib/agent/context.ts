import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AgentContext } from "./types";

/** Construit le contexte d'exécution à partir de la session Supabase (cookies). */
export async function getAgentContext(): Promise<AgentContext> {
  const supabase = await createServerSupabase();
  if (!supabase) return { user: null, supabase: null, trusted: false };
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;
  if (!user) return { user: null, supabase, trusted: false };

  const admins = (process.env.BCX_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  let trusted = Boolean(user.email && user.email_confirmed_at && admins.includes(user.email.toLowerCase()));
  if (!trusted) {
    const { data: profile } = await supabase.from("bcx_profiles").select("role").eq("user_id", user.id).maybeSingle();
    trusted = profile?.role === "admin" || profile?.role === "editor";
  }
  return { user, supabase, trusted };
}
