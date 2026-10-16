import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MODEL = "gemini-nano-banana-2.1";

type InteractionContent = {
  type?: string;
  text?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
};
type InteractionStep = {
  type?: string;
  content?: InteractionContent[] | string;
  output_image?: { data?: string; mime_type?: string; mimeType?: string };
};
type InteractionResponse = {
  status?: string;
  output_image?: { data?: string; mime_type?: string; mimeType?: string };
  steps?: InteractionStep[];
  error?: { message?: string };
};

function getImage(result: InteractionResponse) {
  const convenienceImage = result.output_image;
  if (convenienceImage?.data) {
    return {
      data: convenienceImage.data,
      mimeType: convenienceImage.mime_type ?? convenienceImage.mimeType ?? "image/png",
    };
  }

  for (const step of result.steps ?? []) {
    const contents = Array.isArray(step.content) ? step.content : [];
    for (const item of contents) {
      if (item.type === "image" && item.data) {
        return { data: item.data, mimeType: item.mime_type ?? item.mimeType ?? "image/png" };
      }
    }
    if (step.output_image?.data) {
      return {
        data: step.output_image.data,
        mimeType: step.output_image.mime_type ?? step.output_image.mimeType ?? "image/png",
      };
    }
  }
  return null;
}

function getText(result: InteractionResponse) {
  return (result.steps ?? [])
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .slice(0, 600);
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
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  const mode = body.mode === "edit" ? "edit" : "generate";
  if (prompt.length < 3) {
    return NextResponse.json({ error: "Décris l’image à créer ou les modifications souhaitées." }, { status: 400 });
  }

  const input: Array<Record<string, string>> = [{
    type: "text",
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
    input.push({ type: "image", data: base64, mime_type: mimeType });
  }

  const configuredModel = (process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL).trim();
  // Gemini 3.1 Flash Image is scheduled to shut down on 2026-10-29; migrate legacy env values automatically.
  const model = ["gemini-3.1-flash-image", "gemini-3.1-flash-image-preview"].includes(configuredModel)
    ? DEFAULT_MODEL
    : configuredModel;
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
          aspect_ratio: "4:5",
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return NextResponse.json({ error: "Le service d’image n’a pas répondu. Réessaie dans quelques instants." }, { status: 502 });
  }

  const result = await response.json().catch(() => null) as InteractionResponse | null;
  if (!response.ok || !result) {
    const detail = typeof result?.error?.message === "string" ? result.error.message.slice(0, 240) : "";
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

  const generated = getImage(result);
  if (generated?.data && /^image\/(png|jpeg|webp)$/.test(generated.mimeType)) {
    return NextResponse.json({
      image: `data:${generated.mimeType};base64,${generated.data}`,
      mimeType: generated.mimeType,
      model,
    });
  }

  return NextResponse.json(
    { error: getText(result) || "Le modèle n’a renvoyé aucune image. Essaie une description plus précise ou vérifie le modèle configuré." },
    { status: 502 },
  );
}
