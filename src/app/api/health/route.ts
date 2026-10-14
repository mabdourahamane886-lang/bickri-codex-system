import { NextResponse } from "next/server";
import { getConfigStatus } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Statut de santé et de configuration. Ne divulgue aucune valeur secrète. */
export function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString(), config: getConfigStatus() }, { headers: { "Cache-Control": "no-store" } });
}
