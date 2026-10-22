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

export class OpenAICompatibleImageProvider implements ImageProvider {
  readonly name = "openai-compatible";

  async generate(request: ImageRequest): Promise<ImageResult> {
    const apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Le fournisseur d'images compatible OpenAI n'est pas configuré : ajoute IMAGE_API_KEY ou OPENAI_API_KEY côté serveur.");
    }

    const baseUrl = (process.env.IMAGE_API_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\\/+$/, "");
    const model = (process.env.IMAGE_OPENAI_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim();
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        n: 1,
        size: IMAGE_SIZES[request.aspectRatio ?? "1:1"],
        response_format: "b64_json",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });

    const payload = await response.json().catch(() => null) as ImageGenerationResponse | null;
    if (!response.ok) {
      const detail = payload?.error?.message?.slice(0, 250);
      console.error("OpenAI-compatible image provider failed", { status: response.status, model, detail });
      throw new Error(response.status === 401 || response.status === 403
        ? "La clé du fournisseur d'images est invalide ou n'a pas accès au modèle."
        : response.status === 429
          ? "La limite ou le quota du fournisseur d'images est atteint."
          : "Le fournisseur compatible OpenAI n'a pas pu générer l'image.");
    }

    const first = payload?.data?.[0];
    if (!first?.b64_json) {
      // Do not fetch arbitrary provider-supplied URLs from the server.
      throw new Error("Le fournisseur compatible OpenAI n'a pas renvoyé d'image en base64.");
    }

    const mimeType = first.mime_type ?? first.mimeType ?? "image/png";
    if (!/^image\\/(png|jpeg|webp)$/.test(mimeType)) {
      throw new Error("Le fournisseur d'images a renvoyé un format non pris en charge.");
    }

    return { mimeType, base64: first.b64_json, provider: this.name, model };
  }
}
