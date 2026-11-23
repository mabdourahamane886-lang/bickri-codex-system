import "server-only";
import { AIError, type ChatMessage } from "./gemini";

type OllamaReply = { message?: { content?: string; thinking?: string }; error?: string; model?: string };

export function isOllamaConfigured(): boolean {
  return process.env.AI_PROVIDER === "ollama" && Boolean(process.env.OLLAMA_BASE_URL);
}

export async function generateWithOllama(options: {
  systemInstruction: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
}): Promise<{ answer: string; model: string }> {
  const base = process.env.OLLAMA_BASE_URL?.trim();
  const model = process.env.OLLAMA_MODEL?.trim() || "qwen3:8b";
  if (!base) throw new AIError("Configure OLLAMA_BASE_URL sur le serveur BCX.", 503, "AI_NOT_CONFIGURED");

  let url: URL;
  try {
    url = new URL(base);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))) {
      throw new Error("TLS required");
    }
    if (url.username || url.password || url.search || url.hash) throw new Error("Invalid URL");
    if (url.pathname !== "/" && url.pathname !== "") throw new Error("Base URL must not contain path");
  } catch {
    throw new AIError("OLLAMA_BASE_URL doit être une URL HTTPS valide (HTTP local uniquement en développement).", 503, "AI_NOT_CONFIGURED");
  }
  url.pathname = "/api/chat";
  const token = process.env.OLLAMA_API_TOKEN?.trim();
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: options.systemInstruction },
          ...options.messages.map(message => ({ role: message.role, content: message.content })),
        ],
        options: { num_predict: Math.min(Math.max(options.maxOutputTokens, 128), 16384) },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(115_000),
    });
    if (!response.ok) throw new AIError("Le moteur Ollama a refusé la requête (HTTP " + response.status + ").", 503, "AI_PROVIDER_UNAVAILABLE");
    const payload = await response.json() as OllamaReply;
    const answer = payload.message?.content?.trim();
    if (!answer) throw new AIError("Ollama a renvoyé une réponse vide.", 502, "AI_EMPTY_RESPONSE");
    return { answer, model: payload.model || model };
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError("Le serveur Ollama est inaccessible ou a dépassé le délai autorisé.", 503, "AI_PROVIDER_UNAVAILABLE");
  }
}
