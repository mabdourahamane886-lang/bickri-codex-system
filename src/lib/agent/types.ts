import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AgentContext = {
  user: User | null;
  supabase: SupabaseClient | null;
  /** Compte de confiance (rôle admin/editor ou e-mail dans BCX_ADMIN_EMAILS). */
  trusted: boolean;
};

export type Tool = {
  /** Nom unique exposé au modèle : [a-z0-9_]. */
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  /** Action d'écriture : nécessite une validation humaine avant exécution. */
  write: boolean;
  /** Libellé lisible pour l'interface. */
  label: (args: Record<string, unknown>) => string;
  run: (args: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
};

export type PluginStatus = { id: string; name: string; description: string; available: boolean; reason?: string; tools: number; writeTools: number };

export interface Plugin {
  id: string;
  name: string;
  description: string;
  /** Prépare les outils (connexion MCP, etc.). Renvoie [] si indisponible. */
  load(ctx: AgentContext): Promise<{ tools: Tool[]; close?: () => Promise<void>; reason?: string }>;
}

export function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max) : v === undefined || v === null ? "" : String(v).slice(0, max);
}
