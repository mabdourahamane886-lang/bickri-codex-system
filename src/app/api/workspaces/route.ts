import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkspaceFile = {
  id: string;
  name: string;
  language: "html" | "css" | "javascript" | "typescript" | "python";
  content: string;
};

const MAX_FILES = 100;
const MAX_FILE_CHARS = 250_000;
const MAX_TOTAL_CHARS = 1_000_000;

function validateFiles(value: unknown): value is WorkspaceFile[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FILES) return false;
  let total = 0;
  for (const file of value) {
    if (!file || typeof file !== "object") return false;
    const item = file as Record<string, unknown>;
    if (typeof item.id !== "string" || item.id.length > 80) return false;
    if (typeof item.name !== "string" || !/^[a-zA-Z0-9._-]{1,120}$/.test(item.name)) return false;
    if (!["html", "css", "javascript", "typescript", "python"].includes(String(item.language))) return false;
    if (typeof item.content !== "string" || item.content.length > MAX_FILE_CHARS) return false;
    total += item.content.length;
    if (total > MAX_TOTAL_CHARS) return false;
  }
  return true;
}

async function getUserClient() {
  const supabase = await createServerSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Le stockage cloud Supabase n'est pas configuré." }, { status: 503 }) };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Connecte-toi pour accéder à tes projets cloud." }, { status: 401 }) };
  return { supabase, user };
}

export async function GET() {
  const auth = await getUserClient();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("bcx_ide_workspaces")
    .select("id,name,files,updated_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error) {
    console.error("BCX workspace list failed:", error.message);
    return NextResponse.json({ error: "Impossible de charger les projets cloud. Vérifie que la migration BCX IDE est appliquée." }, { status: 503 });
  }
  return NextResponse.json({ workspaces: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await getUserClient();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "Mon projet BCX";
  if (!name || !validateFiles(body.files)) {
    return NextResponse.json({ error: "Projet invalide : vérifie le nom, les fichiers et leur taille." }, { status: 400 });
  }

  const id = typeof body.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)
    ? body.id : null;

  const query = id
    ? await auth.supabase.from("bcx_ide_workspaces").update({ name, files: body.files, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", auth.user.id).select("id,name,files,updated_at").maybeSingle()
    : await auth.supabase.from("bcx_ide_workspaces").insert({ user_id: auth.user.id, name, files: body.files }).select("id,name,files,updated_at").single();

  if (query.error || !query.data) {
    console.error("BCX workspace save failed:", query.error?.message ?? "workspace not found");
    return NextResponse.json({ error: "Impossible d'enregistrer ce projet cloud." }, { status: 503 });
  }
  return NextResponse.json({ workspace: query.data }, { headers: { "Cache-Control": "no-store" } });
}
