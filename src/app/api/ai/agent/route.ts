import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/gemini";
import { generateWithRouter } from "@/lib/ai/router";
import { resolveThinkingMode, type ThinkingMode } from "@/lib/ai/thinking";
import { buildSystemInstruction } from "@/lib/ai/prompt";
import { getAgentContext } from "@/lib/agent/context";
import { runAgent, sanitizeContents } from "@/lib/agent/run";
import { PLUGINS } from "@/lib/agent/plugins";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { recordAIUsage } from "@/lib/ai/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Liste des plugins et de leur disponibilité pour l'utilisateur courant. */
export async function GET() {
  try {
    const ctx = await getAgentContext();
    const results = await Promise.allSettled(PLUGINS.map(async (p) => {
      const loaded = await p.load(ctx);
      try {
        return { id: p.id, name: p.name, description: p.description, available: loaded.tools.length > 0, reason: loaded.reason, tools: loaded.tools.length, writeTools: loaded.tools.filter((t) => t.write).length };
      } finally {
        await loaded.close?.();
      }
    }));
    // Un plugin défaillant ne doit pas rendre indisponible toute l'interface de chat.
    const plugins = results.map((result, index) => result.status === "fulfilled"
      ? result.value
      : { id: PLUGINS[index].id, name: PLUGINS[index].name, description: PLUGINS[index].description, available: false, reason: "Connecteur temporairement indisponible.", tools: 0, writeTools: 0 });
    return NextResponse.json({ signedIn: Boolean(ctx.user), trusted: ctx.trusted, plugins }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Agent capabilities unavailable:", error instanceof Error ? error.message : error);
    return NextResponse.json({ signedIn: false, trusted: false, plugins: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY est manquante dans les variables serveur Vercel.", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const limit = rateLimit(`agent:${clientKey(request.headers)}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: `Trop de requêtes. Réessaie dans ${limit.retryAfter} s.` }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 }); }

  const contents = sanitizeContents(body.contents);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : undefined;
  if (message) contents.push({ role: "user", parts: [{ text: message }] });
  if (!contents.length) return NextResponse.json({ error: "Écris un message avant d'envoyer." }, { status: 400 });

  const pluginIds = Array.isArray(body.plugins) ? body.plugins.filter((p): p is string => typeof p === "string") : [];
  let ctx: Awaited<ReturnType<typeof getAgentContext>>;
  try {
    ctx = await getAgentContext();
  } catch (error) {
    console.error("Agent context unavailable:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "L’espace de travail est momentanément indisponible. Réessaie dans quelques instants.", code: "AGENT_CONTEXT_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const language = typeof body.language === "string" ? body.language.slice(0, 80) : "multi-langage";
    const projectContext = typeof body.projectContext === "string" ? body.projectContext.slice(0, 12000) : "";
    const requestedThinkingMode: ThinkingMode = body.thinkingMode === "fast" || body.thinkingMode === "balanced" || body.thinkingMode === "deep" || body.thinkingMode === "expert" || body.thinkingMode === "auto" ? body.thinkingMode : "auto";
    const latestUserQuery = [...contents].reverse().find((item) => item.role === "user")?.parts.filter((part) => typeof part.text === "string").map((part) => part.text || "").join("\n") || "";
    const thinkingMode = resolveThinkingMode(latestUserQuery, requestedThinkingMode);
    try {
      if (!apiKey) throw new AIError("Gemini n'est pas configuré; bascule vers un fournisseur IA de secours en mode réponse textuelle.", 503, "AI_PROVIDER_UNAVAILABLE");
      if (body.stream === true) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (type: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
            };
            void (async () => {
              try {
                send("phase", { phase: "analysis", label: "Analyse de la demande", status: "started", at: new Date().toISOString() });
                const result = await runAgent({
                  ctx, apiKey, contents, pluginIds, decision, language, projectContext,
                  thinkingMode: requestedThinkingMode,
                  onProgress: (event) => send("activity", { ...event, at: new Date().toISOString() }),
                });
                send("phase", { phase: "complete", label: "Traitement terminé", status: "ok", at: new Date().toISOString() });
                if (result.answer) await recordAIUsage({ userId: ctx.user?.id, capability: "chat", provider: "Gemini", outcome: "success", latencyMs: Date.now() - startedAt });
                send("result", { ...result, thinkingMode });
              } catch (error) {
                send("stream_error", { error: error instanceof Error ? error.message : "Erreur pendant le traitement." });
              } finally {
                controller.close();
              }
            })();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }
      const result = await runAgent({ ctx, apiKey, contents, pluginIds, decision, language, projectContext, thinkingMode: requestedThinkingMode });
      if (result.answer) await recordAIUsage({ userId: ctx.user?.id, capability: "chat", provider: "Gemini", outcome: "success", latencyMs: Date.now() - startedAt });
      return NextResponse.json({ ...result, thinkingMode });
    } catch (agentError) {
      if (!(agentError instanceof AIError) || !["AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_BUSY", "AI_NETWORK_TIMEOUT", "AI_QUOTA_OR_RATE_LIMIT", "AI_EMPTY_RESPONSE", "AI_PROVIDER_ERROR", "AI_ACCESS_DENIED", "AI_BAD_REQUEST", "AI_MODEL_NOT_FOUND"].includes(agentError.code || "")) {
        throw agentError;
      }
      const fallbackMessages = contents
        .map((item) => ({
          role: item.role === "model" ? "assistant" as const : "user" as const,
          content: item.parts.filter((part) => typeof part.text === "string").map((part) => part.text || "").join("\n").trim(),
        }))
        .filter((item) => item.content.length > 0)
        .slice(-12);
      if (!fallbackMessages.some((item) => item.role === "user")) throw agentError;
      const latestUserQuery = [...fallbackMessages].reverse().find((item) => item.role === "user")?.content || "";
      const fallback = await generateWithRouter({
        systemInstruction: buildSystemInstruction(language, projectContext, [], latestUserQuery),
        messages: fallbackMessages,
        thinkingMode: requestedThinkingMode,
      });
      await recordAIUsage({ userId: ctx.user?.id, capability: "chat", provider: fallback.provider || "fallback", outcome: "success", latencyMs: Date.now() - startedAt });
      const fallbackContents = [...contents, { role: "model" as const, parts: [{ text: fallback.answer }] }];
      return NextResponse.json({
        contents: fallbackContents,
        events: [],
        answer: fallback.answer,
        model: fallback.model,
        provider: fallback.provider,
        thinkingMode: fallback.thinkingMode,
        fallbackMode: true,
        plugins: PLUGINS.map((plugin) => ({ id: plugin.id, name: plugin.name, description: plugin.description, available: false, reason: "Réponse textuelle de secours : les outils nécessitent Gemini.", tools: 0, writeTools: 0 })),
      });
    }
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("Agent", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "L'agent a rencontré une erreur. Réessaie." }, { status: 500 });
  }
}
