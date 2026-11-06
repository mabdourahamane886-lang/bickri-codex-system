import "server-only";

export type ThinkingMode = "auto" | "fast" | "balanced" | "deep" | "expert";
export type ResolvedThinkingMode = "fast" | "balanced" | "deep" | "expert";

export function getThinkingBudget(mode: ResolvedThinkingMode): number {
  return mode === "fast" ? 0 : mode === "balanced" ? 1024 : mode === "deep" ? 4096 : 8192;
}

const DEEP_PATTERNS = [
  /\b(architecture|architect(?:ure|ure)|refactor|debug|diagnostic|sécurité|security|performance|optimis|migration|déploiement|deploy|audit|analyse complète|compare|comparaison|plan détaillé|étape par étape)\b/i,
  /\b(api|database|base de données|authentification|supabase|vercel|cloudflare|github|typescript|next\.js|flutter|android|kotlin|python|sql)\b/i,
  /\b(erreur|bug|exception|stack trace|corrige|corriger|implémente|implémenter|construis|construire|crée|créer|code|fonctionnalité)\b/i,
];

export function resolveThinkingMode(input: string, requested: unknown = "auto"): ResolvedThinkingMode {
  if (requested === "fast") return "fast";
  if (requested === "balanced") return "balanced";
  if (requested === "deep") return "deep";
  if (requested === "expert") return "expert";
  const text = input.trim();
  if (text.length > 1800) return "deep";
  const score = DEEP_PATTERNS.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
  if (score >= 2 || (score >= 1 && text.length > 450)) return "deep";
  if (text.length > 180 || /\b(explique|pourquoi|comment|différence|résume|résoudre|compare|conçois|planifie)\b/i.test(text)) return "balanced";
  return "fast";
}

const SPECIALIST_WORKFLOW = "\n\nORCHESTRATION SPÉCIALISÉE BCX : pour les tâches complexes, adopte une revue multi-rôle structurée avant de répondre. Active uniquement les perspectives pertinentes parmi : (1) Architecte — objectifs, architecture, dépendances et évolutivité; (2) Développeur — implémentation minimale et maintenable; (3) QA — cas limites, tests reproductibles et critères d'acceptation; (4) Sécurité — permissions, données, secrets et surfaces d'attaque; (5) DevOps — configuration, observabilité, déploiement et retour arrière. Confronte ces perspectives, résous leurs désaccords à partir des faits disponibles, puis fournis une seule recommandation cohérente. N'affirme pas que des agents indépendants ont été exécutés : il s'agit d'une méthode de revue coordonnée dans le modèle. Toute action d'écriture ou opération sensible reste soumise aux validations et permissions existantes.";

 /** Instructions de qualité de réponse, sans demander ni exposer de chaîne de pensée privée. */
export function getThinkingInstruction(mode: ResolvedThinkingMode): string {
  if (mode === "fast") return "\n\nMODE BICKRI SMART THINKING — RAPIDE : réponds directement, clairement et sans digression. Vérifie les points essentiels.";
  if (mode === "balanced") return "\n\nMODE BICKRI SMART THINKING — ÉQUILIBRÉ : structure la réponse, vérifie les hypothèses importantes, utilise les connaissances pertinentes et signale les incertitudes. Ne révèle pas de raisonnement interne privé.";
  if (mode === "deep") return "\n\nMODE BICKRI SMART THINKING — APPROFONDI : identifie objectifs, contraintes, dépendances et cas limites; compare les solutions réalistes; vérifie la cohérence et fournis une solution concrète avec tests ou critères de validation. Distingue faits, hypothèses et inconnues. Présente une synthèse explicable, jamais une chaîne de pensée privée." + SPECIALIST_WORKFLOW;
  return "\n\nMODE BICKRI SMART THINKING — EXPERT : adopte une démarche d’analyse renforcée. Définis le résultat attendu et les critères de réussite; examine plusieurs approches; confronte les hypothèses aux éléments disponibles; recherche les contre-exemples, risques, dépendances et effets secondaires; vérifie les calculs, interfaces et cas limites; choisis la solution la plus robuste en justifiant brièvement les compromis. Pour les sujets techniques, propose des tests reproductibles, une stratégie de validation et un plan de retour arrière si nécessaire. Pour les faits récents, exige des sources actuelles. Si une preuve manque, dis-le clairement. Fournis uniquement les conclusions, les preuves utiles et une explication concise, jamais de chaîne de pensée privée." + SPECIALIST_WORKFLOW;
}
