import "server-only";

import { AIError, type ChatMessage } from "./gemini";

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  error?: { message?: string; type?: string; code?: string };
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function mapError(status: number, detail: string): AIError {
  if (status === 401 || status === 403) return new AIError("DeepSeek a refusé l'accès. Vérifie DEEPSEEK_API_KEY dans les variables serveur.", 502, "AI_ACCESS_DENIED");
  if (status === 404) return new AIError("Le modèle DeepSeek configuré est introuvable. Vérifie DEEPSEEK_MODEL.", 502, "AI_MODEL_NOT_FOUND");
  if (status === 402 || status === 429) return new AIError(`Le quota ou la limite DeepSeek est atteint (HTTP ${status}). Vérifie le solde et les limites de ton compte. ${detail}`, 429, "AI_QUOTA_OR_RATE_LIMIT");
  if (RETRYABLE.has(status)) return new AIError(`DeepSeek est temporairement indisponible (HTTP ${status}). ${detail}`, 503, "AI_PROVIDER_UNAVAILABLE");
  if (status === 400) return new AIError(`DeepSeek a rejeté la requête (HTTP 400). Vérifie le modèle et les paramètres. ${detail}`, 502, "AI_BAD_REQUEST");
  return new AIError(`Erreur de l'API DeepSeek (HTTP ${status}). ${detail}`, 502, "AI_PROVIDER_ERROR");
}

/** Active le mode thinking; le raisonnement privé du fournisseur n'est jamais transmis au client. */
export async function generateWithDeepSeek(opts: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
}): Promise<{ answer: string; model: string }> {
  const messages = [
    { role: "system", content: opts.systemInstruction },
    ...opts.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  let response: Response | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: opts.model,
          messages,
          thinking: { type: "enabled" },
          reasoning_effort: process.env.DEEPSEEK_REASONING_EFFORT || "high",
          max_tokens: opts.maxOutputTokens ?? 8192,
          stream: false,
        }),
        signal: AbortSignal.timeout(55000),
        cache: "no-store",
      });
      if (!RETRYABLE.has(response.status) || attempt === 1) break;
    } catch {
      if (attempt === 1) throw new AIError("Impossible de joindre l'API DeepSeek après plusieurs tentatives.", 503, "AI_NETWORK_TIMEOUT");
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }

  if (!response) throw new AIError("DeepSeek n'a pas répondu. Réessaie dans quelques instants.", 503, "AI_PROVIDER_UNAVAILABLE");
  const data = (await response.json().catch(() => null)) as DeepSeekResponse | null;
  if (!response.ok) {
    const detail = typeof data?.error?.message === "string" ? data.error.message.slice(0, 300) : "Aucun détail fourni.";
    console.error("Erreur API DeepSeek", response.status, detail);
    throw mapError(response.status, detail);
  }
  const answer = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!answer) throw new AIError("DeepSeek n'a renvoyé aucun texte exploitable.", 502, "AI_EMPTY_RESPONSE");
  return { answer, model: opts.model };
}
