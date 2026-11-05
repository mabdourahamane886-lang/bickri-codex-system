import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Proxy sécurisé vers un runner externe dédié. Aucun code arbitraire n'est exécuté dans Next.js/Vercel. */
export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-execute:${clientKey(request.headers)}`, 5, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Limite d'exécution atteinte." }, { status: 429 });
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Authentification indisponible." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour exécuter du code." }, { status: 401 });
  const endpoint = process.env.BCX_SANDBOX_URL;
  const token = process.env.BCX_SANDBOX_TOKEN;
  if (!endpoint || !token) return NextResponse.json({
    error: "Le runner isolé n'est pas encore raccordé. Configure BCX_SANDBOX_URL et BCX_SANDBOX_TOKEN après le déploiement du worker sécurisé.",
    code: "SANDBOX_NOT_CONFIGURED",
  }, { status: 503 });
  let url: URL;
  try { url = new URL(endpoint); } catch { return NextResponse.json({ error: "Configuration du runner invalide." }, { status: 503 }); }
  if (url.protocol !== "https:" && url.hostname !== "localhost") return NextResponse.json({ error: "Le runner doit utiliser HTTPS." }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }
  const code = typeof body.code === "string" ? body.code : "";
  const language = typeof body.language === "string" ? body.language.toLowerCase() : "";
  if (!code.trim() || code.length > 30000) return NextResponse.json({ error: "Le code doit contenir au maximum 30 000 caractères." }, { status: 400 });
  if (!["python", "javascript", "typescript"].includes(language)) return NextResponse.json({ error: "Langages autorisés : Python, JavaScript et TypeScript." }, { status: 400 });
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, language, stdin: typeof body.stdin === "string" ? body.stdin.slice(0, 5000) : "", limits: { timeoutMs: 5000, memoryMb: 128, network: false }, userId: user.id }),
      signal: AbortSignal.timeout(12000), cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: "Le runner a refusé ou échoué l'exécution.", details: typeof result.error === "string" ? result.error.slice(0, 500) : undefined }, { status: 502 });
    return NextResponse.json({ result, isolated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Le runner sécurisé est injoignable." }, { status: 503 });
  }
}
