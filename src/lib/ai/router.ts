import "server-only";
import { AIError, generateWithGemini, type ChatMessage } from "./gemini";

type RouterOptions = { systemInstruction: string; messages: ChatMessage[]; maxOutputTokens?: number; excludeProviders?: AIProvider[] };
type AIProvider = "google";
type ProviderResult = { answer: string; model: string; provider: AIProvider };

export function getAIProviderOrder(_provider = process.env.AI_PROVIDER || "auto"): AIProvider[] {
  // BCX is Gemini-only: no OpenAI, OpenRouter, or Anthropic fallback.
  return ["google"];
}

export async function generateWithRouter(opts: RouterOptions): Promise<ProviderResult> {
  const googleKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!googleKey) throw new AIError("GEMINI_API_KEY est manquante dans les variables serveur Vercel.", 503, "AI_NOT_CONFIGURED");
  // BCX currently routes assistant requests exclusively through Gemini.
  const order = getAIProviderOrder().filter((provider) => !opts.excludeProviders?.includes(provider));
  const failures: string[] = [];

  for (const provider of order) {
    try {
      if (provider === "anthropic") {
        if (!anthropicKey) {
          throw new AIError("ANTHROPIC_API_KEY n’est pas configurée dans l’environnement serveur.", 503, "AI_NOT_CONFIGURED");
        }
        return await generateWithAnthropic({
          ...opts,
          apiKey: anthropicKey,
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        });
      }
      if (provider === "google") {
        if (!googleKey) continue;
        const configuredModel = process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "";
        const configuredFallback = process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "";
        const normalizeModel = (value: string, fallback: string) =>
          ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].includes(value) ? fallback : value;
        const primary = normalizeModel(configuredModel, "gemini-3.8-flash") || "gemini-3.8-flash";
        const secondary = normalizeModel(configuredFallback, "gemini-3.6-flash") || "gemini-3.6-flash";
        const extraFallbacks = (process.env.AI_MODEL_FALLBACKS || process.env.GEMINI_FALLBACK_MODELS || "")
          .split(",").map((value) => value.trim()).filter(Boolean);
        const models = [...new Set([primary, secondary, ...extraFallbacks])];
        let lastError: unknown;
        for (let index = 0; index < models.length; index++) {
          const model = models[index];
          const fallbackModel = models[index + 1] || model;
          try {
            const result = await generateWithGemini({
              apiKey: googleKey,
              model,
              fallbackModel,
              systemInstruction: opts.systemInstruction,
              messages: opts.messages,
              maxOutputTokens: opts.maxOutputTokens,
            });
            return { ...result, provider: "google" };
          } catch (error) {
            lastError = error;
            console.warn(`Bickri AI : modèle Gemini ${model} indisponible; essai du modèle suivant.`);
          }
        }
        throw lastError instanceof Error ? lastError : new AIError("Tous les modèles Gemini configurés ont échoué.", 503, "AI_PROVIDER_UNAVAILABLE");
      }
      const isRouter = provider === "openrouter";
      const providerKey = isRouter ? openRouterKey : openAIKey;
      if (!providerKey) continue;
      const baseUrl = (isRouter
        ? (process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1")
        : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")).replace(/\/$/, "");
      const model = isRouter
        ? (process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "openai/gpt-4o-mini")
        : (process.env.OPENAI_MODEL || "gpt-4o-mini");
      return await generateOpenAICompatible({ ...opts, apiKey: providerKey, baseUrl, model });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Erreur fournisseur inconnue.");
      console.warn(`Bickri AI : échec du fournisseur ${provider}; tentative de repli.`);
    }
  }
  if (!googleKey && !openAIKey && !openRouterKey && !anthropicKey) {
    throw new AIError("Aucune clé IA serveur n'est configurée. Ajoute une clé pour le fournisseur choisi.", 503, "AI_NOT_CONFIGURED");
  }
  throw new AIError(failures.length ? `Tous les fournisseurs IA configurés ont échoué. ${failures[failures.length - 1]}` : "Aucun fournisseur IA compatible avec la configuration choisie.", 503, "AI_PROVIDERS_EXHAUSTED");
}
