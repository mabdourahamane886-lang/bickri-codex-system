import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MODEL = "gemini-nano-banana-2.1";
const FALLBACK_MODELS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-2.5-flash-image"] as const;

type GeminiImage = { data?: string; mime_type?: string; mimeType?: string };
type GeminiContentPart = {
  type?: string;
  text?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  inlineData?: { data?: string; mimeType?: string; mime_type?: string };
  inline_data?: { data?: string; mime_type?: string; mimeType?: string };
};
type GeminiStep = { content?: GeminiContentPart[] | string; output_image?: GeminiImage };
type GeminiResponse = {
  output_image?: GeminiImage;
  steps?: GeminiStep[];
  candidates?: Array<{ content?: { parts?: GeminiContentPart[] } }>;
  error?: { message?: string; status?: string };
};

function imageFromPart(part: GeminiContentPart) {
  const inline = part.inlineData ?? part.inline_data;
  const data = part.data ?? inline?.data;
  const mimeType = part.mime_type ?? part.mimeType ?? inline?.mime_type ?? inline?.mimeType;
  if (data && (!part.type || part.type === "image" || inline)) {
    return { data, mimeType: mimeType ?? "image/png" };
  }
  return null;
}

function extractImage(result: GeminiResponse) {
  if (result.output_image?.data) {
    return {
      data: result.output_image.data,
      mimeType: result.output_image.mime_type ?? result.output_image.mimeType ?? "image/png",
    };
  }

  for (const step of result.steps ?? []) {
    if (step.output_image?.data) {
      return {
        data: step.output_image.data,
        mimeType: step.output_image.mime_type ?? step.output_image.mimeType ?? "image/png",
      };
    }
    if (Array.isArray(step.content)) {
      for (const part of step.content) {
        const image = imageFromPart(part);
        if (image) return image;
      }
    }
  }

  for (const candidate of result.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const image = imageFromPart(part);
      if (image) return image;
    }
  }
  return null;
}

function extractText(result: GeminiResponse) {
  const stepText = (result.steps ?? [])
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  const candidateText = (result.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  return (stepText || candidateText).slice(0, 600);
}

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
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  const mode = body.mode === "edit" ? "edit" : "generate";
  if (prompt.length < 3) {
    return NextResponse.json({ error: "Décris l’image à créer ou les modifications souhaitées." }, { status: 400 });
  }

  const input: Array<Record<string, string>> = [];
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
    input.push({ type: "image", data: base64, mime_type: mimeType });
  }

  input.push({
    type: "text",
    text: mode === "edit"
      ? `Modifie l’image fournie en respectant cette demande : ${prompt}. Retourne l’image modifiée, pas seulement une description. Préserve les éléments qui ne doivent pas changer.`
      : `Crée une image originale de haute qualité à partir de cette description : ${prompt}. Retourne une image, pas seulement une description textuelle.`,
  });

  // A trailing dot or whitespace is a common Vercel env-var typo; normalize it.
  const configuredModel = (process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL).trim().replace(/[.\s]+$/, "");
  const models = [...new Set([configuredModel || DEFAULT_MODEL, ...FALLBACK_MODELS])];
  let lastStatus = 502;
  let lastDetail = "";
  let lastModel = models[0];
  let finalResult: GeminiResponse | null = null;

  for (const model of models) {
    lastModel = model;
    let response: Response;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model,
          input,
          response_format: {
            type: "image",
            mime_type: "image/png",
            aspect_ratio: "4:5",
            image_size: "1K",
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      });
    } catch {
      return NextResponse.json(
        { error: "Gemini ne répond pas actuellement. Vérifie la connexion puis réessaie." },
        { status: 502 },
      );
    }

    const result = await response.json().catch(() => null) as GeminiResponse | null;
    if (response.ok && result) {
      finalResult = result;
      break;
    }

    lastStatus = response.status;
    lastDetail = typeof result?.error?.message === "string" ? result.error.message.slice(0, 300) : "";
    console.error("Gemini image request failed", { model, status: lastStatus, detail: lastDetail });

    // Retry only when a model identifier/endpoint is rejected, not for auth or quota failures.
    if (response.status !== 404 && response.status !== 400) break;
  }

  if (!finalResult) {
    const message = lastStatus === 401 || lastStatus === 403
      ? "La clé Gemini est invalide ou n’a pas accès à la génération d’images. Vérifie GEMINI_API_KEY dans Vercel."
      : lastStatus === 429
        ? "Le quota Gemini est atteint. Vérifie les limites et la facturation de ton projet Google AI."
        : lastStatus === 404 || lastStatus === 400
          ? "Aucun des modèles Gemini Image configurés n’est disponible pour cette clé. Vérifie l’accès au modèle dans Google AI Studio."
          : "La génération d’image Gemini a échoué. Vérifie la configuration et réessaie.";
    return NextResponse.json(
      { error: message, providerDetail: lastDetail || undefined, model: lastModel },
      { status: lastStatus === 429 ? 429 : 502 },
    );
  }

  const generated = extractImage(finalResult);
  if (generated?.data && /^image\/(png|jpeg|webp)$/.test(generated.mimeType)) {
    return NextResponse.json({
      image: `data:${generated.mimeType};base64,${generated.data}`,
      mimeType: generated.mimeType,
      model: lastModel,
    });
  }

  const text = extractText(finalResult);
  console.error("Gemini image response contained no image", { model: lastModel, text });
  return NextResponse.json(
    { error: text || "Gemini n’a renvoyé aucune image. Essaie une description plus précise.", model: lastModel },
    { status: 502 },
  );
}
