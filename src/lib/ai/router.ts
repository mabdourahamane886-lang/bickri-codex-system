import "server-only";
import { AIError, generateWithGemini, type ChatMessage } from "./gemini";

type RouterOptions = {
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  excludeProviders?: AIProvider[];
};

type AIProvider = "google";
type ProviderResult = { answer: string; model: string; provider: AIProvider };

/** BCX utilise exclusivement Gemini pour les réponses conversationnelles. */
export function getAIProviderOrder(): AIProvider[] {
  return ["google"];
}

export async function generateWithRouter(opts: RouterOptions): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    throw new AIError(
      "Le service IA n'est pas encore configuré. Réessaie ultérieurement.",
      503,
      "AI_NOT_CONFIGURED",
    );
  }

  if (opts.excludeProviders?.includes("google")) {
    throw new AIError("Aucun fournisseur IA disponible pour cette requête.", 503, "AI_PROVIDERS_EXHAUSTED");
  }

  const primaryModel = process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallbackModel =
    process.env.AI_MODEL_FALLBACK ||
    process.env.GEMINI_FALLBACK_MODEL ||
    "gemini-2.5-flash-lite";

  try {
    const result = await generateWithGemini({
      apiKey,
      model: primaryModel,
      fallbackModel,
      systemInstruction: opts.systemInstruction,
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens,
    });
    return { ...result, provider: "google" };
  } catch (error) {
    if (error instanceof AIError) throw error;
    console.error("Bickri AI: erreur inattendue du routeur Gemini.");
    throw new AIError(
      "Le service IA rencontre un problème temporaire. Réessaie dans quelques instants.",
      503,
      "AI_PROVIDER_UNAVAILABLE",
    );
  }
}
