import { NextRequest, NextResponse } from "next/server";
import { AIError, generateWithGemini, type ChatMessage } from "@/lib/ai/gemini";
import { buildSystemInstruction } from "@/lib/ai/prompt";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La variable GEMINI_API_KEY est absente. Ajoute-la dans Vercel → Settings → Environment Variables puis redéploie.", code: "AI_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const limit = rateLimit(`ai:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Trop de requêtes. Réessaie dans ${limit.retryAfter} s.`, code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { messages?: unknown; language?: unknown; projectContext?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is ChatMessage => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (!messages.some((m) => m.role === "user")) {
    return NextResponse.json({ error: "Écris une question de programmation avant d'envoyer." }, { status: 400 });
  }

  const language = typeof body.language === "string" ? body.language.slice(0, 80) : "multi-langage";
  const projectContext = typeof body.projectContext === "string" ? body.projectContext.slice(0, 12000) : "";

  try {
    const { answer, model } = await generateWithGemini({
      apiKey,
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash",
      systemInstruction: buildSystemInstruction(language, projectContext),
      messages,
    });
    return NextResponse.json({ answer, model });
  } catch (error) {
    if (error instanceof AIError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Erreur de connexion IA", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json(
      { error: "La connexion au service IA a échoué. Réessaie dans quelques instants.", code: "AI_CONNECTION_FAILED" },
      { status: 502 },
    );
  }
}
