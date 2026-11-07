import type { NextRequest } from "next/server";

/** Reject cross-origin browser writes while allowing non-browser clients without Fetch Metadata. */
export function isSameOriginWrite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin === request.nextUrl.origin; }
    catch { return false; }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}
