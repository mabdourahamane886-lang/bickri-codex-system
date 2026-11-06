import "server-only";

/**
 * Limiteur local best-effort.
 * Chaque instance serverless possède son propre compteur : les quotas ne sont donc
 * pas globaux. Utiliser un stockage partagé (Redis/Upstash ou RPC PostgreSQL) pour
 * imposer des quotas cohérents entre plusieurs instances.
 */
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { count: number; reset: number }>();

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.reset <= now) buckets.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.reset <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      pruneExpired(now);
      // Bound memory even if every bucket is still active.
      if (buckets.size >= MAX_BUCKETS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
    }
    bucket = { count: 1, reset: now + windowMs };
    buckets.set(key, bucket);
    return { ok: true, retryAfter: 0 };
  }

  bucket.count++;
  return { ok: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)) };
}

/**
 * Best-effort IP identifier for routes that need an anonymous client key.
 * Never use this value as an authentication or authorization identity.
 */
export function clientKey(headers: Headers): string {
  return headers.get("x-real-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "anonyme";
}
