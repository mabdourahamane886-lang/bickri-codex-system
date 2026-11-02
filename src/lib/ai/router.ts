import "server-only";
import { AIError, generateWithGemini, type ChatMessage } from "./gemini";
import { generateWithDeepSeek } from "./deepseek";

type AIProvider = "deepseek" | "google";
type RouterOptions = {
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  excludeProviders?: AIProvider[];
};
type ProviderResult = { answer: string; model: string; provider: AIProvider };

/** DeepSeek Reasoning est le moteur principal; Gemini reste le fournisseur de secours. */
export function getAIProviderOrder(): AIProvider[] {
  return ["deepseek", "google"];
}

export async function generateWithRouter(opts: RouterOptions): Promise<ProviderResult> {
  const excluded = new Set(opts.excludeProviders ?? []);
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (!excluded.has("deepseek") && deepseekKey) {
    try {
      const result = await generateWithDeepSeek({
        apiKey: deepseekKey,
        model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
        systemInstruction: opts.systemInstruction,
        messages: opts.messages,
        maxOutputTokens: opts.maxOutputTokens,
      });
      return { ...result, provider: "deepseek" };
    } catch (error) {
      const canFallback = error instanceof AIError &&
        ["AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_BUSY", "AI_NETWORK_TIMEOUT", "AI_QUOTA_OR_RATE_LIMIT", "AI_EMPTY_RESPONSE"].includes(error.code || "");
      if (!canFallback || !geminiKey || excluded.has("google")) throw error;
      console.warn("Bickri AI: DeepSeek indisponible; bascule vers Gemini.");
    }
  }

  if (!excluded.has("google") && geminiKey) {
    const result = await generateWithGemini({
      apiKey: geminiKey,
      model: process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-2.5-flash",
      fallbackModel: process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite",
      systemInstruction: opts.systemInstruction,
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens,
    });
    return { ...result, provider: "google" };
  }

  if (!deepseekKey && !geminiKey) {
    throw new AIError("Aucun fournisseur IA n'est configuré. Ajoute DEEPSEEK_API_KEY dans les variables serveur.", 503, "AI_NOT_CONFIGURED");
  }
  throw new AIError("Aucun fournisseur IA disponible pour cette requête.", 503, "AI_PROVIDERS_EXHAUSTED");
}
