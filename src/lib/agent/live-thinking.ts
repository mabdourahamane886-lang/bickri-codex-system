import "server-only";

/**
 * Événements publics de progression BCX.
 * Ne transporte jamais le raisonnement interne du modèle : uniquement les
 * opérations observables (recherche, outils, agents, génération et statut).
 */
export type BCXThinkingPhase =
  | "analysis"
  | "agents"
  | "memory"
  | "web_search"
  | "tools"
  | "generation"
  | "approval"
  | "complete"
  | "error";

export type BCXThinkingEvent = {
  id: string;
  type: "phase" | "tool" | "agent" | "complete" | "error";
  phase: BCXThinkingPhase;
  label: string;
  status?: "started" | "ok" | "error" | "pending" | "refused";
  timestamp: string;
  details?: { name?: string; durationMs?: number };
};

export function createThinkingEvent(
  input: Omit<BCXThinkingEvent, "id" | "timestamp">,
): BCXThinkingEvent {
  return {
    ...input,
    id: globalThis.crypto?.randomUUID?.() ?? `bcx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
  };
}

/** Encode un événement SSE sans exposer de données internes du modèle. */
export function encodeThinkingSSE(event: BCXThinkingEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const BCX_THINKING_MAX_AGENTS = 10;
