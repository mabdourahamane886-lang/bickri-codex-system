import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai/gemini";
import { getAgentContext } from "@/lib/agent/context";
import { runAgent, sanitizeContents } from "@/lib/agent/run";
import { PLUGINS } from "@/lib/agent/plugins";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Liste des plugins et de leur disponibilité pour l'utilisateur courant. */
export async function GET() {
  const ctx = await getAgentContext();
  const plugins = await Promise.all(PLUGINS.map(async (p) => {
    const loaded = await p.load(ctx);
    await loaded.close?.();
    return { id: p.id, name: p.name, description: p.description, available: loaded.tools.length > 0, reason: loaded.reason, tools: loaded.tools.length, writeTools: loaded.tools.filter((t) => t.write).length };
  }));
  return NextResponse.json({ signedIn: Boolean(ctx.user), trusted: ctx.trusted, plugins }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Aucune clé IA serveur n'est configurée (AI_API_KEY ou GEMINI_API_KEY).", code: "AI_NOT_CONFIGURED" }, { status: 503 });

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
  const ctx = await getAgentContext();

  try {
    const result = await runAgent({
      ctx,
      apiKey,
      contents,
      pluginIds,
      decision,
      language: typeof body.language === "string" ? body.language.slice(0, 80) : "multi-langage",
      projectContext: typeof body.projectContext === "string" ? body.projectContext.slice(0, 12000) : "",
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("Agent", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "L'agent a rencontré une erreur. Réessaie." }, { status: 500 });
  }
}
