import { NextRequest, NextResponse } from "next/server";
import { getAgentContext } from "@/lib/agent/context";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 20;

/** Déclenche uniquement un hook Vercel explicitement configuré pour Preview. */
export async function POST(request: NextRequest) {
  const context = await getAgentContext();
  if (!context.user) return NextResponse.json({ error: "Connecte-toi pour déclencher un déploiement." }, { status: 401 });
  if (!context.trusted) return NextResponse.json({ error: "Action réservée aux administrateurs et éditeurs BCX." }, { status: 403 });
  const limit = rateLimit("preview-deploy:" + context.user.id, 3, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Limite de déploiement Preview atteinte." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const hook = process.env.VERCEL_PREVIEW_DEPLOY_HOOK_URL;
  if (!hook) return NextResponse.json({
    error: "Le hook Preview Vercel n'est pas configuré.",
    setup: "Crée un Deploy Hook Vercel lié à une branche non-production, puis ajoute son URL dans VERCEL_PREVIEW_DEPLOY_HOOK_URL.",
  }, { status: 503 });
  let url: URL;
  try { url = new URL(hook); } catch { return NextResponse.json({ error: "URL du hook invalide." }, { status: 503 }); }
  if (url.protocol !== "https:" || !["vercel.com", "vercel.app"].some((domain) => url.hostname === domain || url.hostname.endsWith("." + domain))) {
    return NextResponse.json({ error: "Le hook doit être une URL HTTPS Vercel valide." }, { status: 503 });
  }

  try {
    const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return NextResponse.json({ error: "Vercel a refusé le déclenchement.", status: response.status }, { status: 502 });
    const result = await response.json().catch(() => null);
    return NextResponse.json({
      accepted: true,
      target: "preview",
      result,
      message: "Vercel a accepté le hook Preview. Le build doit encore être suivi dans Vercel avant de déclarer le déploiement réussi.",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Impossible de contacter le hook Vercel." }, { status: 503 });
  }
}
