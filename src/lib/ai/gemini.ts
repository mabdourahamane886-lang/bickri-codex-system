import "server-only";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export class AIError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "AIError";
  }
}

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS_PER_MODEL = 3;

function extractAnswer(payload: GeminiPayload | null): string {
  return payload?.candidates?.[0]?.content?.parts?.map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim() || "";
}

function httpError(status: number, model: string, detail: string): AIError {
  switch (status) {
    case 400:
    case 401:
      return new AIError(`Gemini a rejeté la requête (HTTP ${status}). Vérifie la clé GEMINI_API_KEY et le modèle GEMINI_MODEL. Détail : ${detail || "requête invalide"}`, 502, "AI_BAD_REQUEST");
    case 403:
      return new AIError(`Gemini refuse l'accès (HTTP 403). Vérifie que l'API Gemini est activée et que ta clé a accès au projet. Détail : ${detail || "accès refusé"}`, 502, "AI_ACCESS_DENIED");
    case 404:
      return new AIError(`Le modèle Gemini « ${model} » est introuvable ou indisponible. Dans Vercel → Settings → Environment Variables, vérifie GEMINI_MODEL puis redéploie.`, 502, "AI_MODEL_NOT_FOUND");
    case 402:
    case 429:
      return new AIError(`La limite ou le quota Gemini est atteint (HTTP ${status}). Vérifie les quotas et la facturation Google AI Studio. Détail : ${detail || "quota dépassé"}`, 429, "AI_QUOTA_OR_RATE_LIMIT");
    case 500:
    case 502:
    case 503:
    case 504:
      return new AIError(`Gemini est temporairement indisponible (HTTP ${status}). Le modèle principal et le modèle de repli n'ont pas répondu correctement. Réessaie dans quelques instants. Détail : ${detail || "service indisponible"}`, 503, "AI_PROVIDER_UNAVAILABLE");
    default:
      return new AIError(`Erreur de l'API Gemini (HTTP ${status}). ${detail || "Vérifie la configuration dans Google AI Studio."}`, 502, "AI_PROVIDER_ERROR");
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Appelle Gemini avec de nouvelles tentatives limitées pour les erreurs
 * transitoires, puis utilise le modèle de repli s'il est différent.
 */
export async function generateWithGemini(opts: {
  apiKey: string;
  model: string;
  fallbackModel: string;
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
}): Promise<{ answer: string; model: string }> {
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: opts.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.2, maxOutputTokens: opts.maxOutputTokens ?? 4096 },
  });

  const call = (model: string, timeoutMs: number) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

  async function callWithRetry(modelName: string): Promise<Response | null> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const response = await call(modelName, 25000);
        if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS_PER_MODEL - 1) {
          return response;
        }
        console.warn(`Gemini : HTTP ${response.status} sur ${modelName}; nouvelle tentative ${attempt + 2}/${MAX_ATTEMPTS_PER_MODEL}.`);
      } catch (error) {
        const isLastAttempt = attempt === MAX_ATTEMPTS_PER_MODEL - 1;
        console.warn(`Gemini : échec réseau sur ${modelName}, tentative ${attempt + 1}/${MAX_ATTEMPTS_PER_MODEL}.`);
        if (isLastAttempt) return null;
      }
      await sleep(500 * 2 ** attempt);
    }
    return null;
  }

  let model = opts.model.trim();
  let response = await callWithRetry(model);

  // En cas d'erreur réseau ou de surcharge, essaie le modèle secondaire
  // uniquement s'il est différent afin d'éviter de répéter la même panne.
  if ((!response || RETRYABLE.has(response.status)) && opts.fallbackModel.trim() !== model) {
    console.warn(`Gemini : modèle principal indisponible (${model}); bascule vers ${opts.fallbackModel}.`);
    model = opts.fallbackModel.trim();
    response = await callWithRetry(model);
  }

  if (!response) {
    throw new AIError("Le service IA n'a pas répondu après plusieurs tentatives. Vérifie l'état de l'API Gemini et réessaie dans quelques instants.", 503, "AI_PROVIDER_UNAVAILABLE");
  }

  const data = (await response.json().catch(() => null)) as GeminiPayload | null;
  if (!response.ok) {
    const detail = typeof data?.error?.message === "string" ? data.error.message.slice(0, 350) : "";
    console.error("Erreur API Gemini", response.status, detail);
    throw httpError(response.status, model, detail);
  }

  let answer = extractAnswer(data);

  // Une réponse HTTP 200 peut être vide. Essaie le modèle secondaire si différent.
  if (!answer && opts.fallbackModel.trim() !== model) {
    console.warn("Gemini : réponse vide; tentative avec le modèle de repli.", {
      finishReason: data?.candidates?.[0]?.finishReason,
      blockReason: data?.promptFeedback?.blockReason,
    });
    const retry = await callWithRetry(opts.fallbackModel.trim());
    if (retry?.ok) {
      answer = extractAnswer((await retry.json().catch(() => null)) as GeminiPayload | null);
      if (answer) model = opts.fallbackModel.trim();
    }
  }

  if (!answer) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "aucun texte retourné";
    throw new AIError(`Gemini n'a renvoyé aucun texte après les nouvelles tentatives (${reason}). Essaie une demande plus courte et précise.`, 502, "AI_EMPTY_RESPONSE");
  }
  return { answer, model };
}
