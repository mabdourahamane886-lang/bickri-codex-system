import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 25;

type GoogleImageItem = { title?: string; link?: string; displayLink?: string; image?: { contextLink?: string; thumbnailLink?: string; width?: number; height?: number } };
type CommonsPage = { title?: string; imageinfo?: Array<{ url?: string; thumburl?: string; width?: number; height?: number }> };

function safeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : ""; } catch { return ""; }
}

async function searchGoogle(query: string, key: string, cx: string) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key); url.searchParams.set("cx", cx); url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image"); url.searchParams.set("num", "10"); url.searchParams.set("safe", "active");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => ({})) as { items?: GoogleImageItem[]; error?: { message?: string } };
  if (!response.ok) { console.warn("Google image search unavailable; trying Wikimedia Commons", { status: response.status, detail: payload.error?.message }); return []; }
  return (payload.items ?? []).flatMap((item) => {
    const imageUrl = safeUrl(item.link); if (!imageUrl) return [];
    return [{ title: typeof item.title === "string" ? item.title.slice(0, 180) : "Image trouvée sur le Web", imageUrl, thumbnailUrl: safeUrl(item.image?.thumbnailLink) || imageUrl, sourceUrl: safeUrl(item.image?.contextLink), sourceName: typeof item.displayLink === "string" ? item.displayLink.slice(0, 120) : "Google Images", width: Number.isFinite(item.image?.width) ? item.image?.width : undefined, height: Number.isFinite(item.image?.height) ? item.image?.height : undefined }];
  });
}

async function searchWikimedia(query: string) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query"); url.searchParams.set("generator", "search"); url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6"); url.searchParams.set("gsrlimit", "10"); url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url"); url.searchParams.set("iiurlwidth", "900"); url.searchParams.set("format", "json"); url.searchParams.set("origin", "*");
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "BickriCodexSystem/1.0 (image search; https://bickri-codex-system.vercel.app)" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("Wikimedia Commons image search failed");
  const payload = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
  return Object.values(payload.query?.pages ?? {}).flatMap((page) => {
    const info = page.imageinfo?.[0]; const imageUrl = safeUrl(info?.url); if (!imageUrl) return [];
    const fileName = (page.title ?? "").replaceAll(" ", "_");
    return [{ title: (page.title ?? "Image Wikimedia Commons").replace(/^File:/, "").slice(0, 180), imageUrl, thumbnailUrl: safeUrl(info?.thumburl) || imageUrl, sourceUrl: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(fileName), sourceName: "Wikimedia Commons", width: info?.width, height: info?.height }];
  });
}

export async function POST(request: NextRequest) {
  const limit = rateLimit("image-search:" + clientKey(request.headers), 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Limite de recherche atteinte. Réessaie dans " + limit.retryAfter + " secondes." }, { status: 429 });
  let body: { query?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 }); }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 300) : "";
  if (query.length < 2) return NextResponse.json({ error: "Précise le sujet des images à rechercher." }, { status: 400 });
  const key = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID || "26e5140231c2c4d42";
  let images: Awaited<ReturnType<typeof searchGoogle>> = []; let provider = "Wikimedia Commons";
  if (key) { try { images = await searchGoogle(query, key, cx); if (images.length) provider = "Google Programmable Search"; } catch (error) { console.warn("Google image search failed; trying Wikimedia Commons", error instanceof Error ? error.message : "unknown"); } }
  if (!images.length) {
    try { images = await searchWikimedia(query); }
    catch (error) { console.error("Wikimedia Commons image search failed", error instanceof Error ? error.message : "unknown"); return NextResponse.json({ error: "Les fournisseurs de recherche d’images sont momentanément indisponibles. Réessaie dans un instant." }, { status: 502 }); }
  }
  return NextResponse.json({ images, query, provider });
}