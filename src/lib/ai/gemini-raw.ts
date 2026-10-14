import "server-only";
import { AIError } from "./gemini";

/** Contenu Gemini brut (conservé tel quel, y compris les thoughtSignature). */
export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
export type FunctionDeclaration = { name: string; description: string; parameters?: Record<string, unknown> };

type Response = {
  candidates?: Array<{ content?: GeminiContent; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const RETRYABLE = new Set([404, 408, 429, 500, 502, 503, 504]);
// Mémorise un modèle principal en échec pour éviter un essai raté à chaque étape.
let primaryDownUntil = 0;

export async function generateContent(opts: {
  apiKey: string;
  model: string;
  fallbackModel: string;
  systemInstruction: string;
  contents: GeminiContent[];
  tools?: FunctionDeclaration[];
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<{ content: GeminiContent; model: string; finishReason?: string }> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: opts.contents,
    ...(opts.tools?.length ? { tools: [{ functionDeclarations: opts.tools }], toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
    generationConfig: { temperature: 0.2, maxOutputTokens: opts.maxOutputTokens ?? 8192 },
  });

  const call = async (model: string) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as Response | null;
    return { res, data };
  };

  const models = Date.now() < primaryDownUntil || opts.model === opts.fallbackModel ? [opts.fallbackModel] : [opts.model, opts.fallbackModel];
  let lastError: AIError | null = null;

  for (const model of models) {
    try {
      const { res, data } = await call(model);
      if (!res.ok) {
        const detail = data?.error?.message?.slice(0, 300) ?? "";
        console.error("Gemini", model, res.status, detail);
        lastError = new AIError(`Gemini a renvoyé une erreur (HTTP ${res.status}) avec ${model}. ${detail}`, res.status === 429 ? 429 : 502);
        if (RETRYABLE.has(res.status) && model === opts.model) { primaryDownUntil = Date.now() + 10 * 60_000; continue; }
        throw lastError;
      }
      const content = data?.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        lastError = new AIError(`Gemini n'a renvoyé aucun contenu (${data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "réponse vide"}).`, 502, "AI_EMPTY_RESPONSE");
        if (model === opts.model) continue;
        throw lastError;
      }
      return { content: { role: "model", parts: content.parts }, model, finishReason: data?.candidates?.[0]?.finishReason };
    } catch (err) {
      if (err instanceof AIError) { if (model === opts.model && models.length > 1) continue; throw err; }
      lastError = new AIError("Le service IA n'a pas répondu à temps. Réessaie dans quelques instants.", 504, "AI_NETWORK_TIMEOUT");
      if (model === opts.model) { primaryDownUntil = Date.now() + 5 * 60_000; continue; }
    }
  }
  throw lastError ?? new AIError("Service IA indisponible.", 503);
}
