import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_DATA = /(?:password|mot de passe|\bmdp\b|secret|api[_ -]?key|clé privée|private key|token|\b\d{8,}\b|@)/i;
const CAPTURE_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(?:retiens|mémorise|memorise|souviens-toi)\s+(?:que\s+)?(.+)/i, category: "explicit" },
  { pattern: /\b(?:à l'avenir|a l'avenir|désormais|desormais|dorénavant|dorenavant)\s*[, :]?\s*(.+)/i, category: "preferences" },
  { pattern: /\b(?:je préfère|je prefere|j'aime|j’aime|mon style préféré|mon style prefere)\s+(.+)/i, category: "preferences" },
  { pattern: /\b(?:mon projet|mon entreprise|mon activité|mon activite|mon métier|mon metier)\s+(?:s'appelle|s’appelle|est|:)?\s*(.+)/i, category: "projects" },
];

function cleanSentence(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").slice(0, 900);
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`ai-memory-capture:${clientKey(request.headers)}`, 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Trop de demandes de mémorisation." }, { status: 429 });
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ captured: 0, reason: "local-only" }, { status: 200 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ captured: 0, reason: "not-authenticated" }, { status: 200 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";
  if (!message || PRIVATE_DATA.test(message)) return NextResponse.json({ captured: 0, reason: "not-eligible" });

  const match = CAPTURE_PATTERNS.map((item) => ({ ...item, result: message.match(item.pattern) }))
    .find((item) => item.result?.[1]);
  if (!match?.result?.[1]) return NextResponse.json({ captured: 0, reason: "no-durable-signal" });

  const content = cleanSentence(match.result[1]);
  if (content.length < 12 || PRIVATE_DATA.test(content)) return NextResponse.json({ captured: 0, reason: "not-eligible" });
  const title = content.length > 92 ? `${content.slice(0, 89)}…` : content;
  const fingerprint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${match.category}:${content.toLocaleLowerCase("fr")}`));
  const hash = Array.from(new Uint8Array(fingerprint), (byte) => byte.toString(16).padStart(2, "0")).join("");

  const { error } = await supabase.from("bcx_ai_memories").upsert({
    user_id: user.id,
    title,
    content,
    category: match.category,
    fingerprint: hash,
  }, { onConflict: "user_id,fingerprint" });
  if (error) {
    console.error("BCX automatic memory capture failed", error.code);
    return NextResponse.json({ error: "La mémorisation automatique a échoué." }, { status: 503 });
  }
  return NextResponse.json({ captured: 1, category: match.category }, { headers: { "Cache-Control": "no-store" } });
}
