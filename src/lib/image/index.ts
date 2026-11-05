import "server-only";

import type { ImageProvider } from "./types";
import { createGeminiProvider } from "./providers/gemini";

export type ImageProviderName = "gemini" | "openai-compatible";

const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
export function getImageProviders(): ImageProvider[] {
  // All BCX image generation routes must use Gemini only.
  const key = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY manquant : configure la clé Gemini dans Vercel.");
  return [createGeminiProvider(key, process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL)];
}

export function getImageProvider(): ImageProvider {
  return getImageProviders()[0];
}

export type { ImageProvider, ImageRequest, ImageResult } from "./types";
