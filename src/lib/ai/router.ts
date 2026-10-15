import "server-only";
import { AIError, generateWithGemini, type ChatMessage } from "./gemini";
type RouterOptions = { systemInstruction: string; messages: ChatMessage[]; maxOutputTokens?: number };
type ProviderResult = { answer: string; model: string; provider: "google" | "openai" | "openrouter" };

export function getAIProviderOrder(provider = process.env.AI_PROVIDER || "auto"): Array<"google" | "openai" | "openrouter"> {
  if (provider === "openai") return ["openai", "google"];
  if (provider === "openrouter") return ["openrouter", "google"];
  if (provider === "google") return ["google", "openai"];
  return ["google", "openai"];
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
  const openAIKey = process.env.OPENAI_API_KEY;
  const order = getAIProviderOrder(process.env.AI_PROVIDER || "auto");
  const failures: string[] = [];
  for (const provider of order) {
    try {
      if (provider === "google") {
        if (!googleKey) continue;
        const result = await generateWithGemini({
          apiKey: googleKey,
          model: process.env.AI_MODEL_DEFAULT || process.env.GEMINI_MODEL || "gemini-3.8-flash",
          fallbackModel: process.env.AI_MODEL_FALLBACK || process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash",
          systemInstruction: opts.systemInstruction,
          messages: opts.messages,
          maxOutputTokens: opts.maxOutputTokens,
        });
        return { ...result, provider: "google" };
      }
      if (!openAIKey) continue;
      const isRouter = provider === "openrouter";
      const baseUrl = (process.env.OPENAI_BASE_URL || (isRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1")).replace(/\/$/, "");
      const model = process.env.OPENAI_MODEL || (isRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini");
      return await generateOpenAICompatible({ ...opts, apiKey: openAIKey, baseUrl, model });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Erreur fournisseur inconnue.");
      console.warn(`Bickri AI : échec du fournisseur ${provider}; tentative de repli.`);
    }
  }
  if (!googleKey && !openAIKey) throw new AIError("Aucune clé IA serveur n'est configurée. Ajoute GEMINI_API_KEY ou OPENAI_API_KEY.", 503, "AI_NOT_CONFIGURED");
  throw new AIError(failures.length ? `Tous les fournisseurs IA configurés ont échoué. ${failures[failures.length - 1]}` : "Aucun fournisseur IA compatible avec la configuration choisie.", 503, "AI_PROVIDERS_EXHAUSTED");
}
