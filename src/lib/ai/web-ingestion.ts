import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  return normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

async function assertPublicHttpUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Seules les URL HTTP/HTTPS sont acceptées.");
  if (url.username || url.password) throw new Error("Les URL avec identifiants intégrés sont interdites.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "metadata.google.internal" || host === "169.254.169.254") {
    throw new Error("Cette adresse locale ou réservée ne peut pas être importée.");
  }
  const ipType = isIP(host);
  if (ipType === 4 && isPrivateIPv4(host)) throw new Error("Les adresses IP privées ne peuvent pas être importées.");
  if (ipType === 6 && isPrivateIPv6(host)) throw new Error("Les adresses IP privées ne peuvent pas être importées.");
  if (!ipType) {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((r) => isIP(r.address) === 4 ? isPrivateIPv4(r.address) : isPrivateIPv6(r.address))) {
      throw new Error("Le domaine ne pointe pas exclusivement vers des adresses publiques.");
    }
  }
  url.hash = "";
  return url;
}

function decodeEntities(value: string): string {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

export async function collectPublicWebPage(input: string): Promise<{ url: string; title: string; text: string }> {
  let current = input;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const safeUrl = await assertPublicHttpUrl(current);
    response = await fetch(safeUrl, {
      redirect: "manual",
      headers: { "User-Agent": "BickriCodexKnowledgeBot/1.0 (+knowledge import; contact site administrator)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Trop de redirections ou redirection invalide.");
      current = new URL(location, safeUrl).toString();
      continue;
    }
    break;
  }

  if (!response?.ok) throw new Error(`La page Web a répondu HTTP ${response?.status ?? "inconnu"}.`);
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
    throw new Error("Cette URL ne fournit pas une page HTML. Les PDF doivent être importés via l'endpoint PDF.");
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > 2_000_000) throw new Error("La page dépasse la limite de 2 Mo.");
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error("La page dépasse la limite de 2 Mo.");

  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() || new URL(current).hostname).slice(0, 180);
  const text = decodeEntities(html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim());

  if (text.length < 100) throw new Error("La page ne contient pas assez de texte exploitable.");
  return { url: new URL(current).toString(), title, text: text.slice(0, 100_000) };
}


/** Backwards-compatible result shape used by the BCX knowledge import route. */
export async function collectPublicWebPage(initialUrl: string): Promise<{ url: string; title: string; text: string }> {
  const page = await fetchPublicWebPage(initialUrl);
  return { url: page.url, title: page.title, text: page.content };
}
