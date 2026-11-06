import "server-only";
import { createClient } from "@supabase/supabase-js";

export async function recordAIUsage(input: {
  userId?: string | null;
  capability: string;
  provider?: string;
  outcome: "success" | "error" | "blocked";
  latencyMs?: number;
  errorCode?: string;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !input.userId) return;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.from("bcx_ai_usage_events").insert({
      user_id: input.userId,
      capability: input.capability.slice(0, 80),
      provider: (input.provider || "Gemini").slice(0, 80),
      outcome: input.outcome,
      latency_ms: Number.isFinite(input.latencyMs) ? Math.max(0, Math.min(600000, Math.round(input.latencyMs!))) : null,
      error_code: input.errorCode?.slice(0, 100) ?? null,
    });
    if (error) console.warn("BCX telemetry write failed", error.code);
  } catch (error) {
    console.warn("BCX telemetry unavailable", error instanceof Error ? error.message : "unknown");
  }
}
