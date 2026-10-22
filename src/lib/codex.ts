/**
 * Règles du système d'identifiants BICKRI CODEX (BCX).
 * Format : BCX-<CATÉGORIE>-<SÉRIE GRECQUE>-<NUMÉRO SUR 3 CHIFFRES MINIMUM>
 * Exemple : BCX-AI-THETA-001
 */

export const CATEGORIES = [
  { code: "AI", label: "Intelligence artificielle" },
  { code: "APP", label: "Applications" },
  { code: "WEB", label: "Sites et plateformes web" },
  { code: "SYS", label: "Systèmes" },
  { code: "SEC", label: "Sécurité numérique" },
  { code: "LAB", label: "Recherche et expérimentation" },
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]["code"];

export const GREEK_LETTERS = (
  [
    ["ALPHA", "Α"], ["BETA", "Β"], ["GAMMA", "Γ"], ["DELTA", "Δ"], ["EPSILON", "Ε"], ["ZETA", "Ζ"],
    ["ETA", "Η"], ["THETA", "Θ"], ["IOTA", "Ι"], ["KAPPA", "Κ"], ["LAMBDA", "Λ"], ["MU", "Μ"],
    ["NU", "Ν"], ["XI", "Ξ"], ["OMICRON", "Ο"], ["PI", "Π"], ["RHO", "Ρ"], ["SIGMA", "Σ"],
    ["TAU", "Τ"], ["UPSILON", "Υ"], ["PHI", "Φ"], ["CHI", "Χ"], ["PSI", "Ψ"], ["OMEGA", "Ω"],
  ] as const
).map(([name, symbol], i) => ({ name, symbol, ordinal: i + 1 }));

export const STATUSES = {
  active: { label: "Actif", tone: "success" },
  draft: { label: "Brouillon", tone: "warning" },
  deprecated: { label: "Obsolète", tone: "danger" },
  archived: { label: "Archivé", tone: "neutral" },
} as const;

export type Status = keyof typeof STATUSES;

export const IDENTIFIER_PATTERN = /^BCX-[A-Z]{2,5}-[A-Z]+-[0-9]{3,}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function formatCode(category: string, greek: string, serial: number): string {
  return `BCX-${category}-${greek}-${String(serial).padStart(3, "0")}`;
}

export function parseCode(identifier: string): { category: string; greek: string; serial: number } | null {
  if (!IDENTIFIER_PATTERN.test(identifier)) return null;
  const [, category, greek, serial] = identifier.split("-");
  return { category, greek, serial: Number(serial) };
}

export function isValidVersion(version: string): boolean {
  return VERSION_PATTERN.test(version.trim());
}

export function categoryLabel(code: string): string {
  return CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

export function greekSymbol(name: string): string {
  return GREEK_LETTERS.find((g) => g.name === name)?.symbol ?? "";
}

/** Prochain numéro libre pour une catégorie et une série, à partir d'une liste d'identifiants. */
export function nextSerial(identifiers: string[], category: string, greek: string, floor = 0): number {
  const prefix = `BCX-${category}-${greek}-`;
  const max = identifiers
    .filter((id) => id.startsWith(prefix))
    .reduce((n, id) => Math.max(n, Number(id.slice(prefix.length)) || 0), floor);
  return max + 1;
}


/** Valide le format et les valeurs autorisées, pas seulement la forme de la chaîne. */
export function isValidCode(identifier: string): boolean {
  const parsed = parseCode(identifier);
  if (!parsed || !CATEGORIES.some((item) => item.code === parsed.category)) return false;
  if (!GREEK_LETTERS.some((item) => item.name === parsed.greek)) return false;
  return Number.isSafeInteger(parsed.serial) && parsed.serial > 0;
}

/** Calcule l'identifiant complet suivant pour une catégorie et une série données. */
export function nextCode(identifiers: string[], category: string, greek: string): string {
  if (!CATEGORIES.some((item) => item.code === category)) throw new Error("Catégorie BCX invalide.");
  if (!GREEK_LETTERS.some((item) => item.name === greek)) throw new Error("Série grecque invalide.");
  return formatCode(category, greek, nextSerial(identifiers.filter(isValidCode), category, greek));
}
