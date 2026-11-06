import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public-safe capability report: reports configuration presence, never secret values. */
export async function GET() {
  const capabilities = {
    reasoningProtocol: true,
    codeAgent: true,
    knowledgeRetrieval: true,
    googleWebSearch: Boolean(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID),
    webSearch: Boolean(process.env.TAVILY_API_KEY || (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID)),
    imageGeneration: Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY),
    voiceInterface: true,
    memoryStorage: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    feedbackCollection: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    modelRouting: true,
    secureSandbox: Boolean(process.env.BCX_SANDBOX_URL && process.env.BCX_SANDBOX_TOKEN),
    spreadsheetAnalysis: true,
    documentExport: true,
    memoryManagement: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    usageTelemetry: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  return NextResponse.json({
    product: "BICKRI CODEX SYSTEM",
    assistant: "Bickri AI",
    capabilities,
    notes: {
      memoryStorage: "La mémoire persistante requiert la migration SQL BCX et l'authentification utilisateur.",
      feedbackCollection: "Les retours nécessitent la migration SQL BCX et une session utilisateur.",
      secureSandbox: "L'exécution est déléguée à un worker externe isolé et nécessite BCX_SANDBOX_URL et BCX_SANDBOX_TOKEN.",
      usageTelemetry: "Les métriques nécessitent SUPABASE_SERVICE_ROLE_KEY côté serveur et le rôle admin dans app_metadata.",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
