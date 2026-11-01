import "server-only";
import { createClient } from "@supabase/supabase-js";

export type UsageOutcome = "success" | "error" | "blocked";

let adminClient: ReturnType<typeof createClient> | null | undefined;

function getAdminClient() {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
  return adminClient;
}

/** Writes minimal operational metrics; never stores prompts, code, tokens, or user content. */
export async function recordBcxUsage(input: {
  userId?: string | null;
  capability: string;
  provider: string;
  outcome: UsageOutcome;
  latencyMs?: number;
  errorCode?: string | null;
}) {
  const client = getAdminClient();
  if (!client) return false;

  try {
    const event = {
      user_id: input.userId ?? null,
      capability: input.capability.slice(0, 80),
      provider: input.provider.slice(0, 80),
      outcome: input.outcome,
      latency_ms: Number.isFinite(input.latencyMs) ? Math.max(0, Math.round(input.latencyMs!)) : null,
      error_code: input.errorCode?.slice(0, 100) ?? null,
    };
    // The project does not yet ship generated Database typings for this table.
    const { error } = await client.from("bcx_ai_usage_events").insert(event as never);
    if (error) {
      console.error("BCX telemetry write failed", error.code);
      return false;
    }
    return true;
  } catch (error) {
    console.error("BCX telemetry unavailable", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

export function isBcxTelemetryConfigured() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
