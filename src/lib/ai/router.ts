import "server-only";
import { AIError, generateWithGemini, type ChatMessage } from "./gemini";

type RouterOptions = { systemInstruction: string; messages: ChatMessage[]; maxOutputTokens?: number; excludeProviders?: AIProvider[] };
type AIProvider = "google" | "openai" | "openrouter" | "anthropic";
type ProviderResult = { answer: string; model: string; provider: AIProvider };

export function getAIProviderOrder(_provider = process.env.AI_PROVIDER || "auto"): AIProvider[] {
  // BCX is Gemini-only: no OpenAI, OpenRouter, or Anthropic fallback.
  return ["google"];
}

async function generateWithAnthropic(opts: RouterOptions & { apiKey: string; model: string }): Promise<ProviderResult> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        system: opts.systemInstruction,
        messages: opts.messages.map((message) => ({ role: message.role, content: message.content })),
        max_tokens: opts.maxOutputTokens ?? 4096,
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    throw new AIError("L’API Anthropic ne répond pas ou la connexion a expiré.", 503, "AI_PROVIDER_UNAVAILABLE");
  }

  const payload = await response.json().catch(() => null) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string; type?: string };
  } | null;

  if (!response.ok) {
    const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 502;
    const code = response.status === 401 || response.status === 403
      ? "ANTHROPIC_AUTH_ERROR"
      : response.status === 429
        ? "AI_QUOTA_OR_RATE_LIMIT"
        : response.status === 404
          ? "ANTHROPIC_MODEL_NOT_FOUND"
          : "AI_PROVIDER_ERROR";
    const detail = response.status === 401 || response.status === 403
      ? "Vérifie la clé Anthropic et ses autorisations."
      : response.status === 404
        ? "Vérifie ANTHROPIC_MODEL dans les variables Vercel."
        : response.status === 429
          ? "Vérifie le quota et les limites de l’API Anthropic."
          : "Vérifie la configuration de l’API Anthropic.";
    throw new AIError(`Anthropic a renvoyé HTTP ${response.status}. ${detail}`, status, code);
  }

  const answer = (payload?.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
  if (!answer) throw new AIError("Anthropic a renvoyé une réponse vide.", 502, "AI_EMPTY_RESPONSE");
  return { answer, model: opts.model, provider: "anthropic" };
}

async function generateOpenAICompatible(opts: RouterOptions & { apiKey: string; model: string; baseUrl: string }): Promise<ProviderResult> {
  let base: URL;
  try { base = new URL(opts.baseUrl); } catch { throw new AIError("OPENAI_BASE_URL n'est pas une URL valide.", 500, "AI_CONFIG_INVALID"); }
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") {
    throw new AIError("Le fournisseur IA doit utiliser HTTPS (sauf un serveur local explicite).", 500, "AI_CONFIG_INVALID");
  }
  let response: Response;
  try {
    response = await fetch(`${base.toString().replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "system", content: opts.systemInstruction }, ...opts.messages.map((m) => ({ role: m.role, content: m.content }))],
        temperature: 0.2,
        max_tokens: opts.maxOutputTokens ?? 4096,
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch { throw new AIError("Le fournisseur IA compatible OpenAI ne répond pas.", 503, "AI_PROVIDER_UNAVAILABLE"); }

  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  } | null;
  if (!response.ok) {
    const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 502;
    throw new AIError(`Le fournisseur IA compatible OpenAI a renvoyé HTTP ${response.status}. Vérifie la clé, le modèle et le quota.`, status, response.status === 429 ? "AI_QUOTA_OR_RATE_LIMIT" : "AI_PROVIDER_ERROR");
  }
  const content = payload?.choices?.[0]?.message?.content;
  const answer = typeof content === "string" ? content.trim() : Array.isArray(content)
    ? content.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text).join("").trim() : "";
  if (!answer) throw new AIError("Le fournisseur IA a renvoyé une réponse vide.", 502, "AI_EMPTY_RESPONSE");
  const provider = opts.baseUrl.includes("openrouter.ai") ? "openrouter" : "openai";
  return { answer, model: opts.model, provider };
}

export async function generateWithRouter(opts: RouterOptions): Promise<ProviderResult> {
  const googleKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!googleKey) throw new AIError("GEMINI_API_KEY est manquante dans les variables serveur Vercel.", 503, "AI_NOT_CONFIGURED");
  const openAIKey = process.env.OPENAI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY || openAIKey;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  // This BCX deployment uses Gemini as its configured provider. When a Gemini key
  // exists, never switch to Anthropic just because an unrelated key is also present.
  const selectedProvider = "google";
  const order = getAIProviderOrder(selectedProvider).filter((provider) => !opts.excludeProviders?.includes(provider));
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
      if (selectedProvider === "anthropic") throw error;
    }
  }
  if (!googleKey && !openAIKey && !openRouterKey && !anthropicKey) {
    throw new AIError("Aucune clé IA serveur n'est configurée. Ajoute une clé pour le fournisseur choisi.", 503, "AI_NOT_CONFIGURED");
  }
  throw new AIError(failures.length ? `Tous les fournisseurs IA configurés ont échoué. ${failures[failures.length - 1]}` : "Aucun fournisseur IA compatible avec la configuration choisie.", 503, "AI_PROVIDERS_EXHAUSTED");
}
