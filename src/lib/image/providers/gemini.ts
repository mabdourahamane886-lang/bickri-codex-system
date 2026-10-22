import "server-only";

import type { ImageProvider, ImageRequest, ImageResult } from "../types";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{
    text?: string;
    inlineData?: { mimeType?: string; data?: string };
    inline_data?: { mime_type?: string; data?: string };
  }> } }>;
  error?: { message?: string };
};

const ASPECT_RATIOS: Record<NonNullable<ImageRequest["aspectRatio"]>, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
};

export function createGeminiProvider(apiKey: string, model: string): ImageProvider {
  const normalizedModel = model.trim().replace(/[.\\s]+$/, "");
  return {
    name: "gemini",
    async generate({ prompt, aspectRatio = "1:1" }: ImageRequest): Promise<ImageResult> {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: { aspectRatio: ASPECT_RATIOS[aspectRatio] },
            },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(55_000),
        },
      );

      const payload = await response.json().catch(() => null) as GeminiResponse | null;
      if (!response.ok) {
        const detail = payload?.error?.message?.slice(0, 250);
        console.error("Gemini image provider failed", { status: response.status, model: normalizedModel, detail });
        throw new Error(response.status === 429
          ? "Le quota Gemini Image est atteint. Réessaie plus tard."
          : response.status === 401 || response.status === 403
            ? "La clé Gemini n'a pas accès à la génération d'images."
            : "Gemini n'a pas pu générer l'image.");
      }

      const parts = payload?.candidates?.[0]?.content?.parts ?? [];
      const image = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
      const base64 = image?.inlineData?.data ?? image?.inline_data?.data;
      const mimeType = image?.inlineData?.mimeType ?? image?.inline_data?.mime_type ?? "image/png";

      if (!base64) throw new Error("Gemini n'a renvoyé aucune image.");
      if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) {
        throw new Error("Gemini a renvoyé un format d'image non pris en charge.");
      }

      return { mimeType, base64, provider: "gemini", model: normalizedModel };
    },
  };
}
