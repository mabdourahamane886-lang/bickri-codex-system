import "server-only";

import type { ImageProvider, ImageRequest, ImageResult } from "../types";

type GeminiImagePart = {
  type?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
};

type GeminiResponse = {
  predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  output_image?: { data?: string; mime_type?: string; mimeType?: string };
  steps?: Array<{
    output_image?: { data?: string; mime_type?: string; mimeType?: string };
    content?: GeminiImagePart[] | string;
  }>;
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>;
  error?: { message?: string };
};

const ASPECT_RATIOS: Record<NonNullable<ImageRequest["aspectRatio"]>, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
};

function imageFromPart(part: GeminiImagePart): { base64: string; mimeType: string } | null {
  const inline = part.inlineData ?? part.inline_data;
  const base64 = part.data ?? inline?.data;
  const mimeType = part.mime_type ?? part.mimeType ?? inline?.mime_type ?? inline?.mimeType;
  if (!base64 || (part.type && part.type !== "image" && !inline)) return null;
  return { base64, mimeType: mimeType ?? "image/png" };
}

function extractImage(payload: GeminiResponse) {
  const prediction = payload.predictions?.find((item) => !!item.bytesBase64Encoded);
  if (prediction?.bytesBase64Encoded) {
    return { base64: prediction.bytesBase64Encoded, mimeType: prediction.mimeType ?? "image/png" };
  }

  const direct = payload.output_image;
  if (direct?.data) {
    return { base64: direct.data, mimeType: direct.mime_type ?? direct.mimeType ?? "image/png" };
  }

  for (const step of payload.steps ?? []) {
    if (step.output_image?.data) {
      return {
        base64: step.output_image.data,
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

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const image = imageFromPart(part);
      if (image) return image;
    }
  }
  return null;
}

export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini";

  async generate(request: ImageRequest): Promise<ImageResult> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) throw new Error("Gemini Image n'est pas configuré : ajoute GEMINI_API_KEY côté serveur.");

    const model = (process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1").trim().replace(/[.\\s]+$/, "");
    const aspectRatio = ASPECT_RATIOS[request.aspectRatio ?? "1:1"];
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        input: [{ type: "text", text: request.prompt }],
        response_format: {
          type: "image",
          mime_type: "image/png",
          aspect_ratio: aspectRatio,
          image_size: "1K",
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });

    const payload = await response.json().catch(() => null) as GeminiResponse | null;
    if (!response.ok) {
      const detail = payload?.error?.message?.slice(0, 300);
      console.error("Gemini image provider failed", { status: response.status, model, detail });
      throw new Error(response.status === 429
        ? "Le quota Gemini Image est atteint. Réessaie plus tard."
        : response.status === 401 || response.status === 403
          ? "La clé Gemini n'a pas accès à la génération d'images."
          : response.status === 404 || response.status === 400
            ? "Le modèle Gemini Image configuré est indisponible ou non autorisé."
            : "Le fournisseur Gemini Image n'a pas pu générer l'image.");
    }

    const image = payload ? extractImage(payload) : null;
    if (!image || !/^image\\/(png|jpeg|webp)$/.test(image.mimeType)) {
      throw new Error("Gemini n'a renvoyé aucune image exploitable.");
    }

    return { mimeType: image.mimeType, base64: image.base64, provider: this.name, model };
  }
}
