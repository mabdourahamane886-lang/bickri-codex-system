import "server-only";

export function getSandboxEndpoint(path: string): { url: URL; token: string } | null {
  const endpoint = process.env.BCX_SANDBOX_URL;
  const token = process.env.BCX_SANDBOX_TOKEN;
  if (!endpoint || !token || token.length < 32) return null;
  try {
    const base = new URL(endpoint);
    if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") return null;
    let prefix = base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname;
    if (prefix.endsWith("/execute")) prefix = prefix.slice(0, -8);
    base.pathname = prefix + path;
    base.search = "";
    base.hash = "";
    return { url: base, token };
  } catch {
    return null;
  }
}

export async function sandboxFetch(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const config = getSandboxEndpoint(path);
  if (!config) throw new Error("BCX sandbox service is not configured.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + config.token);
  if (process.env.BCX_SANDBOX_ACCESS_CLIENT_ID && process.env.BCX_SANDBOX_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", process.env.BCX_SANDBOX_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", process.env.BCX_SANDBOX_ACCESS_CLIENT_SECRET);
  }
  return fetch(config.url, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
