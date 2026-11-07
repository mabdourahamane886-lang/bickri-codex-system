import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sandboxFetch } from "@/lib/sandbox/client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const buildId = request.nextUrl.searchParams.get("buildId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(buildId)) return NextResponse.json({ error: "Identifiant de build invalide." }, { status: 400 });
  try {
    const response = await sandboxFetch("/build/flutter/" + buildId + "/artifact", {
      method: "GET",
      headers: { "x-bcx-owner": user.id },
    }, 55_000);
    if (!response.ok || !response.body) return NextResponse.json({ error: "Artifact indisponible ou build non terminé." }, { status: response.status });
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": response.headers.get("content-disposition") || 'attachment; filename="bcx-app-release"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Téléchargement de l'artifact impossible." }, { status: 503 });
  }
}
