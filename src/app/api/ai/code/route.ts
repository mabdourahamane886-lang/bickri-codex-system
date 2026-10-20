import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/gemini";
import { generateWithRouter } from "@/lib/ai/router";
import { buildSystemInstruction } from "@/lib/ai/prompt";
import { formatRetrievedKnowledge, retrieveKnowledge } from "@/lib/ai/knowledge-retrieval";
import { formatWebSearchResults, isWebSearchConfigured, searchWeb, shouldSearchWeb } from "@/lib/ai/web-search";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!(process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY)) {
    return NextResponse.json({ error: "Aucune clé IA serveur n'est configurée. Ajoute GEMINI_API_KEY ou OPENAI_API_KEY dans Vercel → Settings → Environment Variables.", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  }
  const limit = rateLimit(`ai:${clientKey(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: `Trop de requêtes. Réessaie dans ${limit.retryAfter} s.`, code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: { messages?: unknown; language?: unknown; projectContext?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 }); }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is { role: "user" | "assistant"; content: string } =>
      !!m && typeof m === "object" &&
      (((m as { role?: unknown }).role === "user") || ((m as { role?: unknown }).role === "assistant")) &&
      typeof (m as { content?: unknown }).content === "string")
    .slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!messages.some((m) => m.role === "user")) return NextResponse.json({ error: "Écris une question avant d'envoyer." }, { status: 400 });

  const language = typeof body.language === "string" ? body.language.slice(0, 80) : "multi-langage";
  const projectContext = typeof body.projectContext === "string" ? body.projectContext.slice(0, 12000) : "";
  try {
    const latestUserQuery = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const retrieved = await retrieveKnowledge(latestUserQuery, 5);
    const webResults = isWebSearchConfigured() && shouldSearchWeb(latestUserQuery)
      ? await searchWeb(latestUserQuery, 5)
      : [];
    const retrievedContext = [formatRetrievedKnowledge(retrieved), formatWebSearchResults(webResults)].filter(Boolean).join("\n\n");
    const result = await generateWithRouter({
      systemInstruction: buildSystemInstruction(language, projectContext, [], latestUserQuery, retrievedContext),
      messages,
    });
    return NextResponse.json({
      answer: result.answer,
      model: result.model,
      provider: result.provider,
      sources: webResults.map(({ title, url, snippet, source }) => ({ title, url, snippet, source })),
      webSearch: { configured: isWebSearchConfigured(), used: webResults.length > 0 },
    });
  } catch (error) {
    if (error instanceof AIError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Erreur de connexion IA", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "La connexion au service IA a échoué. Réessaie dans quelques instants.", code: "AI_CONNECTION_FAILED" }, { status: 502 });
  }
}
