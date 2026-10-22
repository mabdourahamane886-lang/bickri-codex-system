import "server-only";

import type { ImageProvider } from "./types";
import { GeminiImageProvider } from "./providers/gemini";
import { OpenAICompatibleImageProvider } from "./providers/openai-compatible";

export type ImageProviderName = "gemini" | "openai-compatible";

export function getImageProvider(): ImageProvider {
  const configured = (process.env.IMAGE_PROVIDER || "auto").trim().toLowerCase();

  if (configured === "gemini") return new GeminiImageProvider();
  if (configured === "openai-compatible" || configured === "openai" || configured === "openrouter") {
    return new OpenAICompatibleImageProvider();
  }

  if (configured !== "auto") {
    throw new Error("IMAGE_PROVIDER doit être auto, gemini ou openai-compatible.");
  }

  if (process.env.GEMINI_API_KEY || process.env.AI_API_KEY) return new GeminiImageProvider();
  if (process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY) return new OpenAICompatibleImageProvider();

  throw new Error("Aucun fournisseur d'images configuré. Ajoute GEMINI_API_KEY ou OPENAI_API_KEY côté serveur.");
}

export type { ImageProvider, ImageRequest, ImageResult } from "./types";
