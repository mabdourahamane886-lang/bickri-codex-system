import "server-only";
import { AIError, generateWithGemini, type ChatMessage } from "./gemini";

export type AIProvider = "google" | "anthropic" | "openai" | "openrouter";
type RouterOptions = {
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  excludeProviders?: AIProvider[];
};
type ProviderResult = { answer: string; model: string; provider: AIProvider };

const DEFAULT_ORDER: AIProvider[] = ["google", "anthropic", "openai", "openrouter"];

/** Ordre déterministe des fournisseurs : priorité demandée, puis replis automatiques. */
export function getAIProviderOrder(preferred = process.env.AI_PROVIDER || "auto"): AIProvider[] {
  const first = preferred.trim().toLowerCase() as AIProvider | "auto";
  if (first === "auto" || !DEFAULT_ORDER.includes(first as AIProvider)) return [...DEFAULT_ORDER];
  return [first, ...DEFAULT_ORDER.filter((provider) => provider !== first)];
}

function hasProviderKey(provider: AIProvider): boolean {
  switch (provider) {
    case "google": return Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY);
    case "anthropic": return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai": return Boolean(process.env.OPENAI_API_KEY);
    case "openrouter": return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
  }
}

function providerModel(provider: AIProvider): string {
  switch (provider) {
    case "google": return process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-2.5-flash";
    case "anthropic": return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    case "openai": return process.env.OPENAI_MODEL || "gpt-4o-mini";
    case "openrouter": return process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || "openai/gpt-4o-mini";
  }
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null) as
    | { error?: { message?: string }; message?: string }
    | null;
  return (data?.error?.message || data?.message || `HTTP ${response.status}`).slice(0, 350);
}

async function generateAnthropic(opts: RouterOptions): Promise<ProviderResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = providerModel("anthropic");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: opts.systemInstruction,
      messages: opts.messages.map(({ role, content }) => ({ role, content })),
      max_tokens: opts.maxOutputTokens ?? 4096,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(45000),
    cache: "no-store",
  });
  if (!response.ok) throw new AIError(`Claude a refusé la requête : ${await readError(response)}`, response.status === 429 ? 429 : 502, "AI_PROVIDER_ERROR");
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const answer = data.content?.filter((part) => part.type === "text").map((part) => part.text || "").join("").trim();
  if (!answer) throw new AIError("Claude a renvoyé une réponse vide.", 502, "AI_EMPTY_RESPONSE");
  return { answer, model, provider: "anthropic" };
}

async function generateOpenAICompatible(provider: "openai" | "openrouter", opts: RouterOptions): Promise<ProviderResult> {
  const isRouter = provider === "openrouter";
  const apiKey = isRouter ? (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)! : process.env.OPENAI_API_KEY!;
  const baseUrl = (isRouter
    ? (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1")
    : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")).replace(/\/+$/, "");
  const model = providerModel(provider);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(isRouter ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://bickri-codex-system.vercel.app", "X-Title": "BICKRI CODEX SYSTEM" } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.systemInstruction },
        ...opts.messages.map(({ role, content }) => ({ role, content })),
      ],
      temperature: 0.2,
      max_tokens: opts.maxOutputTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(45000),
    cache: "no-store",
  });
  if (!response.ok) throw new AIError(`${isRouter ? "OpenRouter" : "OpenAI"} a refusé la requête : ${await readError(response)}`, response.status === 429 ? 429 : 502, "AI_PROVIDER_ERROR");
  const data = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = data.choices?.[0]?.message?.content;
  const answer = (typeof content === "string" ? content : content?.map((part) => part.text || "").join("") || "").trim();
  if (!answer) throw new AIError(`${isRouter ? "OpenRouter" : "OpenAI"} a renvoyé une réponse vide.`, 502, "AI_EMPTY_RESPONSE");
  return { answer, model, provider };
}

async function generateFromProvider(provider: AIProvider, opts: RouterOptions): Promise<ProviderResult> {
  if (provider === "google") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) throw new AIError("Clé Gemini absente.", 503, "AI_NOT_CONFIGURED");
    const model = providerModel("google");
    const fallbackModel = process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";
    const result = await generateWithGemini({
      apiKey,
      model,
      fallbackModel,
      systemInstruction: opts.systemInstruction,
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens,
    });
    return { ...result, provider: "google" };
  }
  if (provider === "anthropic") return generateAnthropic(opts);
  return generateOpenAICompatible(provider, opts);
}

export async function generateWithRouter(opts: RouterOptions): Promise<ProviderResult> {
  const order = getAIProviderOrder().filter((provider) => !opts.excludeProviders?.includes(provider));
  const configured = order.filter(hasProviderKey);
  if (!configured.length) {
    throw new AIError(
      "Aucun fournisseur IA n'est configuré. Ajoute au moins une clé Gemini, Anthropic, OpenAI ou OpenRouter dans les variables serveur.",
      503,
      "AI_NOT_CONFIGURED",
    );
  }

  let lastError: unknown;
  for (const provider of configured) {
    try {
      return await generateFromProvider(provider, opts);
    } catch (error) {
      lastError = error;
      console.error(`Bickri AI: fournisseur ${provider} indisponible; essai du suivant.`, error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  if (lastError instanceof AIError) {
    throw new AIError(
      "Tous les fournisseurs IA configurés ont échoué. Vérifie les clés, les quotas et les modèles dans les variables serveur.",
      lastError.status,
      "AI_PROVIDERS_EXHAUSTED",
    );
  }
  throw new AIError("Aucun fournisseur IA n'a pu traiter la demande.", 503, "AI_PROVIDERS_EXHAUSTED");
}
