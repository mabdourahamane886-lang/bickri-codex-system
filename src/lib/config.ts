import "server-only";

/** Expose uniquement des indicateurs booléens de configuration, jamais les valeurs de variables. */
export function getConfigStatus() {
  return {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openaiCompatible: Boolean(process.env.OPENAI_API_KEY),
    webSearch: Boolean(process.env.TAVILY_API_KEY),
    githubMcp: Boolean(process.env.GITHUB_MCP_URL && process.env.GITHUB_MCP_BEARER_TOKEN),
    googleDrive: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
    notion: Boolean(process.env.NOTION_API_KEY),
  };
}

export type ConfigStatus = ReturnType<typeof getConfigStatus>;
