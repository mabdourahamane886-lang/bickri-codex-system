import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { recordAIUsage } from "@/lib/ai/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CODE_CHARS = 30_000;

async function readBoundedBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Proxy sécurisé vers un runner externe dédié. Aucun code arbitraire n'est exécuté dans Next.js/Vercel. */
export async function POST(request: NextRequest) {
  // Content-Length is only an early hint; the stream is also bounded below.
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Authentification indisponible." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour exécuter du code." }, { status: 401 });

  // Key quotas by the verified Supabase user, not a client-controlled forwarding header.
  const limit = rateLimit(`ai-execute:user:${user.id}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Limite d'exécution atteinte.", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" } },
    );
  }

  const endpoint = process.env.BCX_SANDBOX_URL;
  const token = process.env.BCX_SANDBOX_TOKEN;
  if (!endpoint || !token) return NextResponse.json({
    error: "Le runner isolé n'est pas encore raccordé. Configure BCX_SANDBOX_URL et BCX_SANDBOX_TOKEN après le déploiement du worker sécurisé.",
    code: "SANDBOX_NOT_CONFIGURED",
  }, { status: 503 });

  let url: URL;
  try { url = new URL(endpoint); } catch {
    return NextResponse.json({ error: "Configuration du runner invalide." }, { status: 503 });
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    return NextResponse.json({ error: "Le runner doit utiliser HTTPS." }, { status: 503 });
  }

  let rawBody: string | null;
  try {
    rawBody = await readBoundedBody(request);
  } catch {
    return NextResponse.json({ error: "Impossible de lire la requête." }, { status: 400 });
  }
  if (rawBody === null) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  const language = typeof body.language === "string" ? body.language.toLowerCase() : "";
  if (!code.trim() || code.length > MAX_CODE_CHARS) {
    return NextResponse.json({ error: `Le code doit contenir entre 1 et ${MAX_CODE_CHARS} caractères.` }, { status: 400 });
  }
  if (!["python", "javascript", "typescript"].includes(language)) {
    return NextResponse.json({ error: "Langages autorisés : Python, JavaScript et TypeScript." }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        code,
        language,
        stdin: typeof body.stdin === "string" ? body.stdin.slice(0, 5000) : "",
        limits: { timeoutMs: 5000, memoryMb: 128, network: false },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error.slice(0, 500) : undefined;
      return NextResponse.json({ error: "Le runner a refusé ou échoué l'exécution.", details: error }, { status: 502 });
    }
    if (!result || typeof result !== "object" || !("exitCode" in result) || typeof result.exitCode !== "number") {
      return NextResponse.json({ error: "Réponse invalide du runner sécurisé." }, { status: 502 });
    }

    const exitCode = result.exitCode;
    await recordAIUsage({
      userId: user.id,
      capability: "sandbox_execution",
      provider: "BCX Sandbox",
      outcome: exitCode === 0 ? "success" : "error",
      latencyMs: Date.now() - startedAt,
      errorCode: exitCode === 0 ? undefined : "CODE_EXECUTION_FAILED",
    });
    return NextResponse.json({ result, isolated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Le runner sécurisé est injoignable." }, { status: 503 });
  }
}
