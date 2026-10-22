import "server-only";

import type { ImageProvider, ImageRequest, ImageResult } from "../types";

type ImageGenerationResponse = {
  data?: Array<{ b64_json?: string; mime_type?: string; mimeType?: string }>;
  error?: { message?: string };
};

const IMAGE_SIZES: Record<NonNullable<ImageRequest["aspectRatio"]>, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
};

export function createOpenAICompatibleProvider(
  apiKey: string,
  baseUrl: string,
  model: string,
): ImageProvider {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const normalizedModel = model.trim();

  return {
    name: "openai-compatible",
    async generate({ prompt, aspectRatio = "1:1" }: ImageRequest): Promise<ImageResult> {
      const response = await fetch(`${normalizedBaseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: normalizedModel,
          prompt,
          n: 1,
          size: IMAGE_SIZES[aspectRatio],
          response_format: "b64_json",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      });

      const payload = await response.json().catch(() => null) as ImageGenerationResponse | null;
      if (!response.ok) {
        const detail = payload?.error?.message?.slice(0, 250);
        console.error("OpenAI-compatible image provider failed", { status: response.status, model: normalizedModel, detail });
        throw new Error(response.status === 429
          ? "La limite ou le quota du fournisseur d'images est atteint."
          : response.status === 401 || response.status === 403
            ? "La clé du fournisseur d'images est invalide ou n'a pas accès au modèle."
            : "Le fournisseur compatible OpenAI n'a pas pu générer l'image.");
      }

      const first = payload?.data?.[0];
      if (!first?.b64_json) {
        // Ne pas récupérer une URL fournie par le fournisseur : cela évite les requêtes serveur arbitraires.
        throw new Error("Le fournisseur compatible OpenAI n'a pas renvoyé d'image en base64.");
      }

      const mimeType = first.mime_type ?? first.mimeType ?? "image/png";
      if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) {
        throw new Error("Le fournisseur d'images a renvoyé un format non pris en charge.");
      }

      return { mimeType, base64: first.b64_json, provider: "openai-compatible", model: normalizedModel };
    },
  };
}
