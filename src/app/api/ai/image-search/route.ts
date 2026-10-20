import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 20;

type GoogleImageItem = {
  title?: string;
  link?: string;
  displayLink?: string;
  image?: {
    contextLink?: string;
    thumbnailLink?: string;
    width?: number;
    height?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
  };
};

function safeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  const key = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID || "26e5140231c2c4d42";

  if (!key || !cx) {
    return NextResponse.json({
      error: "La recherche d’images Google n’est pas configurée. Ajoute GOOGLE_SEARCH_API_KEY et GOOGLE_SEARCH_ENGINE_ID dans Vercel.",
      code: "IMAGE_SEARCH_NOT_CONFIGURED",
    }, { status: 503 });
  }

  const limit = rateLimit(`image-search:${clientKey(request.headers)}`, 12, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: `Limite de recherche atteinte. Réessaie dans ${limit.retryAfter} secondes.` }, { status: 429 });
  }

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, 300) : "";
  if (query.length < 2) {
    return NextResponse.json({ error: "Précise le sujet des images à rechercher." }, { status: 400 });
  }

  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", key);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("searchType", "image");
    url.searchParams.set("num", "10");
    url.searchParams.set("safe", "active");

    const upstream = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const payload = await upstream.json().catch(() => ({})) as {
      items?: GoogleImageItem[];
      error?: { message?: string; code?: number };
    };

    if (!upstream.ok) {
      console.error("Google image search failed", { status: upstream.status, detail: payload.error?.message });
      const message = upstream.status === 403 || upstream.status === 429
        ? "Google a refusé la recherche d’images : vérifie l’accès à Custom Search JSON API, la facturation et les quotas du projet."
        : "La recherche d’images Google est momentanément indisponible.";
      return NextResponse.json({ error: message, providerStatus: upstream.status }, { status: upstream.status === 429 ? 429 : 502 });
    }

    const images = (payload.items ?? []).flatMap((item) => {
      const imageUrl = safeUrl(item.link);
      if (!imageUrl) return [];
      const sourceUrl = safeUrl(item.image?.contextLink);
      const thumbnailUrl = safeUrl(item.image?.thumbnailLink) || imageUrl;
      return [{
        title: typeof item.title === "string" ? item.title.slice(0, 180) : "Image trouvée sur le Web",
        imageUrl,
        thumbnailUrl,
        sourceUrl,
        sourceName: typeof item.displayLink === "string" ? item.displayLink.slice(0, 120) : "",
        width: Number.isFinite(item.image?.width) ? item.image?.width : undefined,
        height: Number.isFinite(item.image?.height) ? item.image?.height : undefined,
      }];
    });

    return NextResponse.json({ images, query, provider: "Google Programmable Search" });
  } catch (error) {
    console.error("Google image search error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Impossible de joindre Google pour rechercher les images. Réessaie dans un instant." }, { status: 502 });
  }
}
