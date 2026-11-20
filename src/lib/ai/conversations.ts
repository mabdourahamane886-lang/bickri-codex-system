export type ConversationInput = {
  id: string;
  title: string;
  messages: unknown[];
  language: string;
  pinned?: boolean;
  archived?: boolean;
};

export const MAX_CONVERSATIONS_PER_REQUEST = 10;
export const MAX_CONVERSATION_CHARS = 2_500_000;

export function isConversationInput(value: unknown): value is ConversationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(item.id)) return false;
  if (typeof item.title !== "string" || item.title.trim().length < 1 || item.title.length > 200) return false;
  if (!Array.isArray(item.messages) || item.messages.length > 300) return false;
  if (typeof item.language !== "string" || item.language.length > 80) return false;
  if (item.pinned !== undefined && typeof item.pinned !== "boolean") return false;
  if (item.archived !== undefined && typeof item.archived !== "boolean") return false;
  return item.messages.every((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const entry = message as Record<string, unknown>;
    return (entry.role === "user" || entry.role === "assistant")
      && typeof entry.content === "string"
      && entry.content.length <= 30_000;
  });
}

export function isConversationPayloadWithinLimit(value: unknown[]): boolean {
  return JSON.stringify(value).length <= MAX_CONVERSATION_CHARS;
}
