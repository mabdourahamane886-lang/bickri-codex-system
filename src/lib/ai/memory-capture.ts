import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const PRIVATE_DATA = /(?:password|mot de passe|\bmdp\b|secret|api[_ -]?key|clé privée|private key|token|\b\d{8,}\b|@)/i;
const CAPTURE_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(?:retiens|mémorise|memorise|souviens-toi)\s+(?:que\s+)?(.+)/i, category: "explicit" },
  { pattern: /(?:^|\s)(?:à l['’]avenir|a l['’]avenir|désormais|desormais|dorénavant|dorenavant)\s*[, :]?\s*(.+)/i, category: "preferences" },
  { pattern: /\b(?:je préfère|je prefere|j'aime|j’aime|mon style préféré|mon style prefere)\s+(.+)/i, category: "preferences" },
  { pattern: /\b(?:mon projet|mon entreprise|mon activité|mon activite|mon métier|mon metier)\s+(?:s'appelle|s’appelle|est|:)?\s*(.+)/i, category: "projects" },
];

function cleanSentence(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").slice(0, 900);
}

export function extractMemoryCandidate(message: string) {
  if (!message || PRIVATE_DATA.test(message)) return null;
  for (const { pattern, category } of CAPTURE_PATTERNS) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    const content = cleanSentence(match[1]);
    if (content.length < 12 || PRIVATE_DATA.test(content)) return null;
    return { content, category };
  }
  return null;
}

export async function queueMemoryCapture(supabase: SupabaseClient, message: string) {
  const memory = extractMemoryCandidate(message);
  if (!memory) return false;
  const { error } = await supabase.rpc("bcx_enqueue_memory", {
    memory_content: memory.content,
    memory_category: memory.category,
  }).abortSignal(AbortSignal.timeout(4000));
  if (error) throw new Error(error.code || "memory_enqueue_failed");
  return true;
}
