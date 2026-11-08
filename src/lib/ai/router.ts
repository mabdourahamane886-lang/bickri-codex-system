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

type AIProvider = "google" | "openai";
type ProviderResult = { answer: string; model: string; provider: AIProvider; thinkingMode: ResolvedThinkingMode };

export function getAIProviderOrder(): AIProvider[] {
  return process.env.OPENAI_API_KEY ? ["google", "openai"] : ["google"];
}

async function generateWithOpenAI(opts: {
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
}): Promise<{ answer: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AIError("Aucun fournisseur IA de secours n'est configuré.", 503, "AI_PROVIDERS_EXHAUSTED");

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  let response: Response;
  try {
    response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: opts.systemInstruction },
          ...opts.messages.map((message) => ({ role: message.role, content: message.content })),
        ],
        max_tokens: opts.maxOutputTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    throw new AIError("Le fournisseur OpenAI de secours n'a pas répondu à temps.", 503, "AI_OPENAI_UNAVAILABLE");
  }

  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    console.error("BCX OpenAI fallback failed", response.status, payload?.error?.message?.slice(0, 240) || "no detail");
    throw new AIError("Le fournisseur IA de secours a refusé la requête. Vérifie OPENAI_API_KEY, OPENAI_MODEL et les quotas du compte.", 503, "AI_OPENAI_FALLBACK_FAILED");
  }

  const content = payload?.choices?.[0]?.message?.content;
  const answer = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => part.text || "").join("").trim()
      : "";
  if (!answer) throw new AIError("Le fournisseur IA de secours a renvoyé une réponse vide.", 502, "AI_EMPTY_RESPONSE");
  return { answer, model };
}

/** Gemini reste le moteur prioritaire. OpenAI prend automatiquement le relais si Gemini échoue. */
export async function generateWithRouter(opts: RouterOptions): Promise<ProviderResult> {
  const latestUserQuery = [...opts.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const thinkingMode = resolveThinkingMode(latestUserQuery, opts.thinkingMode);
  const systemInstruction = opts.systemInstruction + getThinkingInstruction(thinkingMode);
  const maxOutputTokens = opts.maxOutputTokens ?? (
    thinkingMode === "fast" ? 3072 :
    thinkingMode === "balanced" ? 4096 :
    thinkingMode === "deep" ? 12288 : 16384
  );

  const googleKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (googleKey && !opts.excludeProviders?.includes("google")) {
    const configuredPrimary = process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-3.8-flash";
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
        apiKey: googleKey,
        model: primaryModel,
        fallbackModel,
        systemInstruction,
        messages: opts.messages,
        maxOutputTokens,
        timeoutMs: thinkingMode === "fast" ? 15_000 : thinkingMode === "expert" ? 40_000 : 30_000,
        maxAttempts: thinkingMode === "fast" ? 1 : 2,
        thinkingMode,
      });
      return { ...result, provider: "google", thinkingMode };
    } catch (error) {
      if (!process.env.OPENAI_API_KEY || opts.excludeProviders?.includes("openai")) {
        if (error instanceof AIError) throw error;
        throw new AIError("Gemini est indisponible et aucun fournisseur de secours n'est configuré.", 503, "AI_PROVIDER_UNAVAILABLE");
      }
      console.warn("BCX: Gemini indisponible; bascule automatique vers OpenAI.");
    }
  }

  if (process.env.OPENAI_API_KEY && !opts.excludeProviders?.includes("openai")) {
    const result = await generateWithOpenAI({ systemInstruction, messages: opts.messages, maxOutputTokens });
    return { ...result, provider: "openai", thinkingMode };
  }
  if (!googleKey) {
    throw new AIError("Aucune clé IA serveur n'est configurée. Ajoute GEMINI_API_KEY ou OPENAI_API_KEY dans Vercel.", 503, "AI_NOT_CONFIGURED");
  }
  throw new AIError("Aucun fournisseur IA disponible pour cette requête.", 503, "AI_PROVIDERS_EXHAUSTED");
}
