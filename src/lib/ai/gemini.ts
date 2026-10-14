import "server-only";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export class AIError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function extractAnswer(payload: GeminiPayload | null): string {
  return payload?.candidates?.[0]?.content?.parts?.map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim() || "";
}

function httpError(status: number, model: string, detail: string): AIError {
  switch (status) {
    case 400:
    case 401:
      return new AIError(`Gemini a rejeté la requête (HTTP ${status}). Vérifie la clé GEMINI_API_KEY et le modèle GEMINI_MODEL. Détail : ${detail || "requête invalide"}`, 502);
    case 403:
      return new AIError(`Gemini refuse l'accès (HTTP 403). Vérifie que l'API Gemini est activée et que ta clé a accès au projet. Détail : ${detail || "accès refusé"}`, 502);
    case 404:
      return new AIError(`Le modèle Gemini « ${model} » est introuvable ou indisponible. Dans Vercel → Settings → Environment Variables, vérifie GEMINI_MODEL puis redéploie.`, 502);
    case 402:
    case 429:
      return new AIError(`La limite ou le quota Gemini est atteint (HTTP ${status}). Vérifie les quotas et la facturation Google AI Studio. Détail : ${detail || "quota dépassé"}`, 429);
    case 500:
    case 503:
    case 504:
      return new AIError(`Gemini est temporairement indisponible (HTTP ${status}). Réessaie dans quelques minutes. Détail : ${detail || "service indisponible"}`, 502);
    default:
      return new AIError(`Erreur de l'API Gemini (HTTP ${status}). ${detail || "Vérifie la configuration dans Google AI Studio."}`, 502);
  }
}

/**
 * Appelle Gemini avec un modèle principal, puis un modèle de repli en cas
 * d'erreur réseau, d'erreur transitoire ou de réponse vide.
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

  let model = opts.model;
  let response: Response;
  try {
    response = await call(model, 25000);
  } catch {
    console.warn("Gemini : échec réseau du modèle principal, tentative avec le modèle de repli.");
    model = opts.fallbackModel;
    try {
      response = await call(model, 25000);
    } catch {
      throw new AIError("Le service IA n'a pas répondu à temps. Réessaie dans quelques instants. Si cela continue, vérifie l'état de l'API Gemini, la clé GEMINI_API_KEY et les limites réseau de Vercel.", 504, "AI_NETWORK_TIMEOUT");
    }
  }

  if (RETRYABLE.has(response.status) && model !== opts.fallbackModel) {
    console.warn(`Gemini : HTTP ${response.status} sur ${model}, tentative avec le modèle de repli.`);
    model = opts.fallbackModel;
    try {
      response = await call(model, 25000);
    } catch {
      throw new AIError("Les modèles IA ne répondent pas pour le moment. Réessaie dans quelques instants. Vérifie aussi les quotas Gemini si le problème persiste.", 503, "AI_PROVIDER_UNAVAILABLE");
    }
  }

  const data = (await response.json().catch(() => null)) as GeminiPayload | null;
  if (!response.ok) {
    const detail = typeof data?.error?.message === "string" ? data.error.message.slice(0, 350) : "";
    console.error("Erreur API Gemini", response.status, detail);
    throw httpError(response.status, model, detail);
  }

  let answer = extractAnswer(data);

  // Une réponse HTTP 200 peut ne contenir aucun texte (candidat bloqué, liste vide).
  if (!answer && model !== opts.fallbackModel) {
    console.warn("Gemini : réponse vide, nouvelle tentative avec le modèle de repli.", {
      finishReason: data?.candidates?.[0]?.finishReason,
      blockReason: data?.promptFeedback?.blockReason,
    });
    try {
      const retry = await call(opts.fallbackModel, 25000);
      if (retry.ok) {
        answer = extractAnswer((await retry.json().catch(() => null)) as GeminiPayload | null);
        if (answer) model = opts.fallbackModel;
      }
    } catch (err) {
      console.error("Gemini : échec du repli", err instanceof Error ? err.message : "erreur inconnue");
    }
  }

  if (!answer) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "aucun texte retourné";
    throw new AIError(`Gemini n'a renvoyé aucun texte, même après une nouvelle tentative (${reason}). Essaie une demande plus courte et précise.`, 502, "AI_EMPTY_RESPONSE");
  }
  return { answer, model };
}
