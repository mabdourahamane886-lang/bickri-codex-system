export const CATEGORIES = [
  { code: "AI", label: "Intelligence artificielle" }, { code: "APP", label: "Applications" },
  { code: "WEB", label: "Sites et plateformes web" }, { code: "SYS", label: "Systèmes" },
  { code: "SEC", label: "Sécurité numérique" }, { code: "LAB", label: "Recherche et expérimentation" },
] as const;
export const GREEK_LETTERS = [
["ALPHA","Α"],["BETA","Β"],["GAMMA","Γ"],["DELTA","Δ"],["EPSILON","Ε"],["ZETA","Ζ"],["ETA","Η"],["THETA","Θ"],["IOTA","Ι"],["KAPPA","Κ"],["LAMBDA","Λ"],["MU","Μ"],["NU","Ν"],["XI","Ξ"],["OMICRON","Ο"],["PI","Π"],["RHO","Ρ"],["SIGMA","Σ"],["TAU","Τ"],["UPSILON","Υ"],["PHI","Φ"],["CHI","Χ"],["PSI","Ψ"],["OMEGA","Ω"]
].map(([name,symbol],i)=>({name,symbol,ordinal:i+1}));
export function formatCode(category: string, greek: string, serial: number) { return `BCX-${category}-${greek}-${String(serial).padStart(3,"0")}`; }
