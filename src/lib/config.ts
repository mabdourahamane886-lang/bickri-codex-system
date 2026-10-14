import "server-only";

/** État de configuration du serveur. Ne renvoie que des booléens et des noms publics, jamais de secret. */
export function getConfigStatus() {
  return {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    ai: Boolean(process.env.GEMINI_API_KEY),
    aiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    aiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash",
    githubMcp: Boolean(process.env.GITHUB_MCP_URL),
  };
}

export type ConfigStatus = ReturnType<typeof getConfigStatus>;
