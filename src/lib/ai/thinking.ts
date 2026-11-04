import "server-only";

export type ThinkingMode = "auto" | "fast" | "deep";
export type ResolvedThinkingMode = "fast" | "balanced" | "deep";

const DEEP_PATTERNS = [
  /\b(architecture|architect(?:ure|ure)|refactor|debug|diagnostic|sécurité|security|performance|optimis|migration|déploiement|deploy|audit|analyse complète|compare|comparaison|plan détaillé|étape par étape)\b/i,
  /\b(api|database|base de données|authentification|supabase|vercel|cloudflare|github|typescript|next\.js|flutter|android|kotlin|python|sql)\b/i,
  /\b(erreur|bug|exception|stack trace|corrige|corriger|implémente|implémenter|construis|construire|crée|créer|code|fonctionnalité)\b/i,
];

export function resolveThinkingMode(input: string, requested: unknown = "auto"): ResolvedThinkingMode {
  if (requested === "fast") return "fast";
  if (requested === "deep") return "deep";
  const text = input.trim();
  if (text.length > 1800) return "deep";
  const score = DEEP_PATTERNS.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
  if (score >= 2 || (score >= 1 && text.length > 450)) return "deep";
  if (text.length > 180 || /\b(explique|pourquoi|comment|différence|résume|résoudre)\b/i.test(text)) return "balanced";
  return "fast";
}

/** Instructions de qualité de réponse, sans demander ni exposer de chaîne de pensée privée. */
export function getThinkingInstruction(mode: ResolvedThinkingMode): string {
  if (mode === "fast") return "\n\nMODE BICKRI SMART THINKING — RAPIDE : réponds directement, clairement et sans digression. Vérifie les points essentiels.";
  if (mode === "balanced") return "\n\nMODE BICKRI SMART THINKING — ÉQUILIBRÉ : structure la réponse, vérifie les hypothèses importantes et signale les incertitudes. Ne révèle pas de raisonnement interne privé.";
  return "\n\nMODE BICKRI SMART THINKING — APPROFONDI : traite la demande avec rigueur. Identifie les objectifs et contraintes, décompose le problème en étapes utiles, vérifie la cohérence et les cas limites, puis fournis une solution concrète avec tests ou critères de validation lorsque pertinent. Présente uniquement une synthèse explicable de la méthode et les conclusions ; ne révèle pas de chaîne de pensée interne privée.";
}
