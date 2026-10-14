import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCode, nextSerial, type Status } from "./codex";

export type Entry = {
  id: string;
  name: string;
  category: string;
  greek: string;
  version: string;
  status: Status;
  createdAt: string;
  source: "local" | "cloud";
};

export const LOCAL_KEY = "bcx_registry_v1";

const today = () => new Date().toISOString().slice(0, 10);

const SEED: Entry[] = [
  { id: "BCX-AI-THETA-001", name: "Bickri AI", category: "AI", greek: "THETA", version: "1.0.0", status: "active", createdAt: "2026-10-09", source: "local" },
  { id: "BCX-WEB-ZETA-001", name: "Bickri Service Agency", category: "WEB", greek: "ZETA", version: "1.0.0", status: "active", createdAt: "2026-10-09", source: "local" },
];

/** Convertit les anciens statuts (« Actif », « Brouillon ») vers les statuts de la base. */
function normalizeStatus(value: unknown): Status {
  if (value === "Actif" || value === "active") return "active";
  if (value === "Brouillon" || value === "draft") return "draft";
  if (value === "deprecated" || value === "archived") return value;
  return "active";
}

// ---------- Stockage local (navigateur) ----------
export function loadLocal(): Entry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return SEED;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SEED;
    return parsed
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as Entry).id === "string" && typeof (e as Entry).name === "string")
      .map((e) => ({
        id: String(e.id),
        name: String(e.name),
        category: String(e.category ?? ""),
        greek: String(e.greek ?? ""),
        version: String(e.version ?? "1.0.0"),
        status: normalizeStatus(e.status),
        createdAt: String(e.createdAt ?? today()),
        source: "local" as const,
      }));
  } catch {
    return SEED;
  }
}

export function saveLocal(entries: Entry[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.filter((e) => e.source === "local")));
  } catch {
    /* stockage plein ou désactivé : on ignore */
  }
}

export function createLocal(entries: Entry[], input: { name: string; category: string; greek: string; version: string }): Entry {
  const used = new Set(entries.map((e) => e.id));
  let serial = nextSerial([...used], input.category, input.greek);
  let id = formatCode(input.category, input.greek, serial);
  while (used.has(id)) id = formatCode(input.category, input.greek, ++serial);
  return { id, ...input, status: "active", createdAt: today(), source: "local" };
}

// ---------- Registre partagé (Supabase) ----------
type ProductRow = {
  identifier: string;
  name: string;
  category_code: string;
  technical_version: string;
  status: Status;
  created_at: string;
  bcx_greek_generations: { name: string } | { name: string }[] | null;
};

export async function listCloud(supabase: SupabaseClient): Promise<Entry[]> {
  const { data, error } = await supabase
    .from("bcx_products")
    .select("identifier,name,category_code,technical_version,status,created_at,bcx_greek_generations(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Lecture du registre partagé impossible. Vérifie que les migrations BCX sont appliquées.");
  return ((data ?? []) as ProductRow[]).map((row) => {
    const g = Array.isArray(row.bcx_greek_generations) ? row.bcx_greek_generations[0] : row.bcx_greek_generations;
    return {
      id: row.identifier,
      name: row.name,
      category: row.category_code,
      greek: g?.name ?? row.identifier.split("-")[2] ?? "",
      version: row.technical_version,
      status: normalizeStatus(row.status),
      createdAt: row.created_at.slice(0, 10),
      source: "cloud" as const,
    };
  });
}

export async function createCloud(
  supabase: SupabaseClient,
  userId: string,
  known: Entry[],
  input: { name: string; category: string; greek: string; version: string },
): Promise<Entry> {
  const { data: greekRow, error: greekError } = await supabase
    .from("bcx_greek_generations").select("id").eq("name", input.greek).eq("cycle", 1).maybeSingle();
  if (greekError) throw new Error("Impossible de lire les séries grecques. Vérifie que les migrations BCX ont été appliquées.");
  if (!greekRow) throw new Error("Série grecque introuvable dans la base. Applique les migrations BCX puis réessaie.");

  const { data: latest, error: latestError } = await supabase
    .from("bcx_products").select("serial_number")
    .eq("category_code", input.category).eq("greek_generation_id", greekRow.id)
    .order("serial_number", { ascending: false }).limit(1);
  if (latestError) throw new Error("Impossible de consulter le registre partagé. Vérifie les permissions de ton compte.");

  let serial = nextSerial(known.map((e) => e.id), input.category, input.greek, Number(latest?.[0]?.serial_number) || 0);

  // Les contraintes d'unicité de la base restent la garantie finale contre les collisions.
  for (let attempt = 0; attempt < 3; attempt++, serial++) {
    const identifier = formatCode(input.category, input.greek, serial);
    const { error } = await supabase.from("bcx_products").insert({
      identifier,
      name: input.name,
      category_code: input.category,
      greek_generation_id: greekRow.id,
      serial_number: serial,
      technical_version: input.version,
      status: "active",
      owner_user_id: userId,
    });
    if (!error) return { id: identifier, ...input, status: "active", createdAt: today(), source: "cloud" };
    if (error.code !== "23505") {
      throw new Error(error.message.includes("row-level security")
        ? "Ton compte n'a pas l'autorisation d'enregistrer cet identifiant. Vérifie ton rôle et les règles d'accès BCX."
        : `Échec de l'enregistrement : ${error.message}`);
    }
  }
  throw new Error("Impossible de réserver un numéro unique après plusieurs tentatives. Réessaie.");
}

export async function deleteCloud(supabase: SupabaseClient, identifier: string) {
  const { error, count } = await supabase.from("bcx_products").delete({ count: "exact" }).eq("identifier", identifier);
  if (error) throw new Error(`Suppression impossible : ${error.message}`);
  if (!count) throw new Error("Suppression refusée : tu ne peux supprimer que les identifiants dont tu es propriétaire.");
}

// ---------- Export ----------
export function toCsv(entries: Entry[]): string {
  const header = ["Identifiant", "Nom", "Catégorie", "Série grecque", "Version", "Statut", "Créé le", "Stockage"];
  const rows = entries.map((e) => [e.id, e.name, e.category, e.greek, e.version, e.status, e.createdAt, e.source === "cloud" ? "partagé" : "local"]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return "\uFEFF" + [header, ...rows].map((r) => r.map(escape).join(";")).join("\n");
}
