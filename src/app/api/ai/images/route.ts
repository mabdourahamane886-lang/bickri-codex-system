import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; mimeType?: string; data?: string } };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  error?: { message?: string };
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La génération d’images n’est pas configurée. Ajoute GEMINI_API_KEY dans Vercel, puis redéploie." },
      { status: 503 },
    );
  }

  const limit = rateLimit(`images:${clientKey(request.headers)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Limite atteinte. Réessaie dans ${limit.retryAfter} secondes.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { prompt?: unknown; mode?: unknown; imageData?: unknown; mimeType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  const mode = body.mode === "edit" ? "edit" : "generate";
  if (prompt.length < 3) {
    return NextResponse.json({ error: "Décris l’image à créer ou les modifications souhaitées." }, { status: 400 });
  }

  const parts: Array<Record<string, unknown>> = [{
    text: mode === "edit"
      ? `Modifie l’image fournie en respectant cette demande : ${prompt}. Retourne une image modifiée, pas seulement une description textuelle. Préserve les éléments qui ne doivent pas changer.`
      : `Crée une image originale de haute qualité à partir de cette description : ${prompt}. Retourne l’image générée, pas seulement une description textuelle.`,
  }];

  if (mode === "edit") {
    const imageData = typeof body.imageData === "string" ? body.imageData : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    if (!imageData || !ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json({ error: "Pour modifier une photo, importe une image JPG, PNG ou WebP." }, { status: 400 });
    }
    const base64 = imageData.replace(/^data:[^;]+;base64,/, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || Math.floor(base64.length * 0.75) > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image invalide ou trop volumineuse (maximum 8 Mo)." }, { status: 413 });
    }
    parts.push({ inlineData: { mimeType, data: base64 } });
  }

  const model = (process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image").trim();
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return NextResponse.json({ error: "Le service d’image n’a pas répondu. Réessaie dans quelques instants." }, { status: 502 });
  }

  const data = await response.json().catch(() => null) as GeminiResponse | null;
  if (!response.ok) {
    const detail = typeof data?.error?.message === "string" ? data.error.message.slice(0, 240) : "";
    console.error("Gemini image API error", response.status, detail);
    const message = response.status === 404
      ? `Le modèle d’image « ${model} » est introuvable. Vérifie GEMINI_IMAGE_MODEL dans Vercel.`
      : response.status === 403 || response.status === 401
        ? "La clé API n’a pas accès au modèle d’image. Vérifie les autorisations de ta clé Gemini."
        : response.status === 429
          ? "Le quota de génération d’images est atteint. Vérifie les quotas et la facturation de ton fournisseur."
          : "La génération d’image a échoué. Vérifie la configuration Gemini et réessaie.";
    return NextResponse.json({ error: message, providerDetail: detail || undefined }, { status: response.status === 429 ? 429 : 502 });
  }

  const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const part of responseParts) {
    const inline = part.inlineData ?? (part.inline_data ? {
      mimeType: part.inline_data.mime_type ?? part.inline_data.mimeType,
      data: part.inline_data.data,
    } : undefined);
    const mime = inline?.mimeType;
    if (inline?.data && mime && /^image\/(png|jpeg|webp)$/.test(mime)) {
      return NextResponse.json({ image: `data:${mime};base64,${inline.data}`, mimeType: mime, model });
    }
  }
  const text = responseParts.map((p) => p.text).filter(Boolean).join("\n").slice(0, 600);
  return NextResponse.json(
    { error: text || "Le modèle n’a renvoyé aucune image. Essaie une description plus précise ou vérifie le modèle configuré." },
    { status: 502 },
  );
}
