import "server-only";
import { AIError } from "./gemini";
import type { ResolvedThinkingMode } from "./thinking";
import { getThinkingBudget } from "./thinking";

/** Contenu Gemini brut (conservé tel quel, y compris les thoughtSignature). */
export type GeminiPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
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
  thinkingMode?: ResolvedThinkingMode;
}): Promise<{ content: GeminiContent; model: string; finishReason?: string }> {
  const generationConfig: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: opts.maxOutputTokens ?? 8192 };
  if (/^gemini-2\.5-/i.test(opts.model) && opts.thinkingMode) generationConfig.thinkingConfig = { thinkingBudget: getThinkingBudget(opts.thinkingMode) };
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: opts.contents,
    ...(opts.tools?.length ? { tools: [{ functionDeclarations: opts.tools }], toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
    generationConfig,
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

  // Plusieurs modèles de repli peuvent être configurés sans toucher au code.
  // En cas de surcharge du modèle principal, on passe directement aux modèles suivants.
  const configuredFallbacks = (process.env.AI_MODEL_FALLBACKS || process.env.GEMINI_FALLBACK_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const preferredModels = [opts.model, opts.fallbackModel, ...configuredFallbacks]
    .filter((model, index, all) => Boolean(model) && all.indexOf(model) === index);
  const healthyModels = Date.now() < primaryDownUntil
    ? preferredModels.filter((model) => model !== opts.model)
    : preferredModels;
  const models = healthyModels.length ? healthyModels : preferredModels;
  let lastError: AIError | null = null;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (const model of models) {
    // Deux essais maximum pour les erreurs temporaires; un 404 passe au modèle suivant.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { res, data } = await call(model);
        if (!res.ok) {
          const detail = data?.error?.message?.slice(0, 300) ?? "";
          console.error("Gemini", model, res.status, detail);
          if (res.status === 404) {
            lastError = new AIError(`Le modèle Gemini « ${model} » est introuvable (HTTP 404). Vérifie le nom du modèle configuré.`, 502, "AI_MODEL_NOT_FOUND");
            if (model === opts.model) primaryDownUntil = Date.now() + 10 * 60_000;
            break;
          }
          if (res.status === 429) {
            lastError = new AIError("Le quota Gemini est temporairement atteint (HTTP 429). BCX essaie un autre modèle ou attend le prochain créneau disponible.", 429, "AI_QUOTA_OR_RATE_LIMIT");
          } else if (RETRYABLE.has(res.status)) {
            lastError = new AIError("Le service Gemini est momentanément indisponible. BCX tente une nouvelle connexion.", 503, "AI_PROVIDER_BUSY");
          } else if (res.status === 403) {
            throw new AIError("Gemini refuse l'accès (HTTP 403). Vérifie les autorisations de la clé et l'activation de l'API.", 502, "AI_ACCESS_DENIED");
          } else {
            throw new AIError(`La requête Gemini a échoué (HTTP ${res.status}). ${detail}`, 502, "AI_PROVIDER_ERROR");
          }
          if (model === opts.model) primaryDownUntil = Date.now() + 5 * 60_000;
          if (attempt === 0 && RETRYABLE.has(res.status) && res.status !== 404) {
            const retryAfter = Number(res.headers.get("retry-after"));
            const delay = Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 8000)
              : 1000;
            await wait(delay);
            continue;
          }
          break;
        }
        const content = data?.candidates?.[0]?.content;
        if (!content?.parts?.length) {
          lastError = new AIError(`Gemini n'a renvoyé aucun contenu (${data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "réponse vide"}).`, 502, "AI_EMPTY_RESPONSE");
          break;
        }
        return { content: { role: "model", parts: content.parts }, model, finishReason: data?.candidates?.[0]?.finishReason };
      } catch (err) {
        if (err instanceof AIError) throw err;
        lastError = new AIError("Le service Gemini n'a pas répondu à temps. BCX tente une nouvelle connexion.", 503, "AI_NETWORK_TIMEOUT");
        if (model === opts.model) primaryDownUntil = Date.now() + 5 * 60_000;
        if (attempt === 0) {
          await wait(750);
          continue;
        }
        break;
      }
    }
  }
  if (lastError?.code === "AI_MODEL_NOT_FOUND" || lastError?.code === "AI_QUOTA_OR_RATE_LIMIT" || lastError?.code === "AI_ACCESS_DENIED") {
    throw lastError;
  }
  throw new AIError(
    "Le service Gemini est temporairement surchargé ou indisponible sur les modèles configurés. Réessaie dans quelques instants ou ajoute un autre modèle de repli dans AI_MODEL_FALLBACKS.",
    503,
    "AI_PROVIDER_UNAVAILABLE",
  );
}
