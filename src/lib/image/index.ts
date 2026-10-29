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
  const kind = (process.env.IMAGE_PROVIDER ?? "auto").trim().toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  const compatibleKey = process.env.IMAGE_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

  if (kind === "auto") {
    const providers: ImageProvider[] = [];
    if (geminiKey) {
      providers.push(createGeminiProvider(geminiKey, process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL));
    }
    if (compatibleKey) {
      const useOpenRouter = Boolean(process.env.OPENROUTER_API_KEY) ||
        (process.env.IMAGE_API_BASE_URL || process.env.IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "").toLowerCase().includes("openrouter.ai");
      const baseUrl = useOpenRouter
        ? (process.env.IMAGE_API_BASE_URL || process.env.IMAGE_BASE_URL || process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL)
        : getCompatibleBaseUrl("openai-compatible");
      providers.push(createOpenAICompatibleProvider(
        compatibleKey,
        baseUrl,
        process.env.IMAGE_OPENAI_MODEL || process.env.IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      ));
    }
    if (providers.length) return providers;
    throw new Error("Aucun fournisseur d'images configuré. Ajoute GEMINI_API_KEY, IMAGE_API_KEY ou OPENAI_API_KEY côté serveur.");
  }

  if (kind === "gemini") {
    const key = geminiKey;
    const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL;
    if (!key) throw new Error("GEMINI_API_KEY manquant");
    return [createGeminiProvider(key, model)];
  }

  if (kind === "openai-compatible" || kind === "openai" || kind === "openrouter") {
    const key = kind === "openrouter" ? (process.env.OPENROUTER_API_KEY || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY) : (process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY);
    const model = process.env.IMAGE_OPENAI_MODEL || process.env.IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    if (!key) throw new Error("IMAGE_API_KEY, OPENROUTER_API_KEY ou OPENAI_API_KEY manquant");
    const baseUrl = kind === "openrouter"
      ? (process.env.IMAGE_API_BASE_URL || process.env.IMAGE_BASE_URL || process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL)
      : getCompatibleBaseUrl(kind);
    return [createOpenAICompatibleProvider(key, baseUrl, model)];
  }

  throw new Error("IMAGE_PROVIDER inconnu : utilise auto, gemini ou openai-compatible.");
}

export function getImageProvider(): ImageProvider {
  return getImageProviders()[0];
}

export type { ImageProvider, ImageRequest, ImageResult } from "./types";
