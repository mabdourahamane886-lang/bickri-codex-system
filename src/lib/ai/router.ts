import "server-only";
import { AIError, generateWithGemini, type ChatMessage } from "./gemini";
import { getThinkingInstruction, resolveThinkingMode, type ThinkingMode, type ResolvedThinkingMode } from "./thinking";

type RouterOptions = {
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  excludeProviders?: AIProvider[];
  thinkingMode?: ThinkingMode;
};

type AIProvider = "google";
type ProviderResult = { answer: string; model: string; provider: AIProvider; thinkingMode: ResolvedThinkingMode };

/** BCX utilise Gemini comme moteur IA ; le mode de réflexion est piloté côté serveur. */
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

  const latestUserQuery = [...opts.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const thinkingMode = resolveThinkingMode(latestUserQuery, opts.thinkingMode);
  const configuredPrimary = process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const primaryModel = thinkingMode === "fast"
    ? process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite"
    : thinkingMode === "expert"
      ? process.env.GEMINI_EXPERT_MODEL || process.env.GEMINI_REASONING_MODEL || configuredPrimary
      : thinkingMode === "deep"
        ? process.env.GEMINI_REASONING_MODEL || configuredPrimary
        : configuredPrimary;
  const fallbackModel = thinkingMode === "fast"
    ? configuredPrimary
    : process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

  try {
    const result = await generateWithGemini({
      apiKey,
      model: primaryModel,
      fallbackModel,
      systemInstruction: opts.systemInstruction + getThinkingInstruction(thinkingMode),
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens ?? (thinkingMode === "fast" ? 3072 : thinkingMode === "balanced" ? 4096 : thinkingMode === "deep" ? 12288 : 16384),
      timeoutMs: thinkingMode === "fast" ? 15000 : thinkingMode === "expert" ? 40000 : thinkingMode === "deep" ? 30000 : 25000,
      maxAttempts: thinkingMode === "fast" ? 1 : 3,
      thinkingMode,
    });
    return { ...result, provider: "google", thinkingMode };
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
