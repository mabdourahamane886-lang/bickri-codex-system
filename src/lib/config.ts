import "server-only";

/** État de configuration du serveur. Ne renvoie que des booléens et des noms publics, jamais de secret. */
export function getConfigStatus() {
  return {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    ai: Boolean(process.env.AI_API_KEY || process.env.GEMINI_API_KEY),
    aiProvider: process.env.AI_PROVIDER || "google",
    aiModel: process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-3.8-flash",
    aiFallbackModel: process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash",
    imageGeneration: Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY),
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
    githubMcp: Boolean(process.env.GITHUB_MCP_URL),
    mcpServers: ["github", "deployments", "registry", "web"].filter((id) => Boolean(process.env[`${id.toUpperCase()}_MCP_URL`] || id === "github" && process.env.GITHUB_MCP_URL)),
  };
}

export type ConfigStatus = ReturnType<typeof getConfigStatus>;
