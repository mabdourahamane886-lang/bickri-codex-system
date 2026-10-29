import { NextRequest, NextResponse } from "next/server";
import { getImageProviders } from "@/lib/image";
import type { ImageRequest } from "@/lib/image/types";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4"]);

export async function POST(request: NextRequest) {
  const limit = rateLimit(`image:${clientKey(request.headers)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Limite atteinte. Réessaie dans ${limit.retryAfter} secondes.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { prompt?: unknown; aspectRatio?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  if (prompt.length < 3) {
    return NextResponse.json({ error: "Décris l'image à créer (au moins 3 caractères)." }, { status: 400 });
  }

  const aspectRatio = typeof body.aspectRatio === "string" && ASPECT_RATIOS.has(body.aspectRatio)
    ? body.aspectRatio as ImageRequest["aspectRatio"]
    : "1:1";

  try {
    const providers = getImageProviders();
    const failures: string[] = [];
    for (const provider of providers) {
      try {
        const result = await provider.generate({ prompt, aspectRatio });
        return NextResponse.json({
          image: `data:${result.mimeType};base64,${result.base64}`,
          mimeType: result.mimeType,
          provider: result.provider,
          model: result.model,
        });
      } catch (providerError) {
        const message = providerError instanceof Error ? providerError.message : "Erreur fournisseur inconnue.";
        failures.push(message);
        console.warn("Image provider failed; trying configured fallback.", { provider: provider.name, message });
      }
    }
    throw new Error(failures.length ? `Tous les fournisseurs d'images ont échoué : ${failures[failures.length - 1]}` : "Aucun fournisseur d'images disponible.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "La génération d'image a échoué.";
    const status = /configur|aucun fournisseur/i.test(message) ? 503 : /quota|limite/i.test(message) ? 429 : 502;
    console.error("Image generation route failed", { message });
    return NextResponse.json({ error: message }, { status });
  }
}
