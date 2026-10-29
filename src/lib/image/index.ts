import "server-only";

import type { ImageProvider } from "./types";
import { createGeminiProvider } from "./providers/gemini";
import { createOpenAICompatibleProvider } from "./providers/openai-compatible";

export type ImageProviderName = "gemini" | "openai-compatible";

const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function getCompatibleBaseUrl(kind: string): string {
  const explicitImageUrl = process.env.IMAGE_API_BASE_URL || process.env.IMAGE_BASE_URL;
  if (explicitImageUrl) return explicitImageUrl;

  const configuredOpenAIUrl = process.env.OPENAI_BASE_URL;
  if (kind === "openrouter") {
    // .env.example sets OPENAI_BASE_URL to OpenAI by default; don't let that override
    // the OpenRouter selection unless the user explicitly configured another URL.
    if (configuredOpenAIUrl && configuredOpenAIUrl !== OPENAI_DEFAULT_BASE_URL) return configuredOpenAIUrl;
    return OPENROUTER_BASE_URL;
  }

  return configuredOpenAIUrl || OPENAI_DEFAULT_BASE_URL;
}

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
