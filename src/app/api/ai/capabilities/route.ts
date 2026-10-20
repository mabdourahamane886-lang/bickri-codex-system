import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public-safe capability report: reports configuration presence, never secret values. */
export async function GET() {
  const capabilities = {
    reasoningProtocol: true,
    codeAgent: true,
    knowledgeRetrieval: true,
    imageGeneration: Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY),
    voiceInterface: true,
    memoryStorage: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    feedbackCollection: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    modelRouting: true,
    secureSandbox: false,
    usageTelemetry: false,
  };
  return NextResponse.json({
    product: "BICKRI CODEX SYSTEM",
    assistant: "Bickri AI",
    capabilities,
    notes: {
      memoryStorage: "La mémoire persistante requiert la migration SQL BCX et l'authentification utilisateur.",
      feedbackCollection: "Les retours nécessitent la migration SQL BCX et une session utilisateur.",
      secureSandbox: "L'exécution arbitraire de code exige un worker isolé dédié; ne pas l'exécuter dans la route web.",
      usageTelemetry: "Les métriques serveur détaillées ne sont pas encore activées.",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
