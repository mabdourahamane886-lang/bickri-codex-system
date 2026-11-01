import { NextResponse } from "next/server";
import { isBcxTelemetryConfigured } from "@/lib/telemetry";

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
    usageTelemetry: isBcxTelemetryConfigured(),
  };
  return NextResponse.json({
    product: "BICKRI CODEX SYSTEM",
    assistant: "Bickri AI",
    capabilities,
    notes: {
      memoryStorage: "La table BCX est installée dans Supabase. La mémoire est privée à chaque compte et nécessite une session authentifiée.",
      feedbackCollection: "Les retours nécessitent la migration SQL BCX et une session utilisateur.",
      secureSandbox: "La sandbox reste désactivée tant que le Worker Cloudflare Containers dédié et ses secrets BCX_SANDBOX_URL / BCX_SANDBOX_TOKEN ne sont pas déployés.",
      usageTelemetry: "Les événements minimaux (capacité, fournisseur, résultat et latence) sont écrits côté serveur sans enregistrer les prompts ni le code.",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
