import "server-only";
import { CATEGORIES, GREEK_LETTERS, formatCode, isValidVersion, nextSerial } from "@/lib/codex";
import { createCloud, listCloud } from "@/lib/registry";
import { str, type Plugin } from "../types";

const categoryEnum: string[] = CATEGORIES.map((c) => c.code);
const greekEnum: string[] = GREEK_LETTERS.map((g) => g.name);

export const registryPlugin: Plugin = {
  id: "registry",
  name: "Registre BCX",
  description: "Consulter le registre partagé et créer des identifiants BCX.",
  async load(ctx) {
    const supabase = ctx.supabase;
    if (!supabase || !ctx.user) return { tools: [], reason: "Connecte-toi pour utiliser le registre partagé." };
    const userId = ctx.user.id;
    return {
      tools: [
        {
          name: "bcx_list_identifiers",
          description: "Liste les identifiants du registre BCX partagé, avec filtre facultatif par texte ou catégorie.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Texte à rechercher dans l'identifiant ou le nom" },
              category: { type: "string", enum: categoryEnum, description: "Code de catégorie" },
            },
          },
          write: false,
          label: (a) => `Consulter le registre${a.query ? ` · ${str(a.query, 60)}` : ""}`,
          run: async (a) => {
            const q = str(a.query).toLowerCase();
            const all = await listCloud(supabase);
            const rows = all.filter((e) => (!q || `${e.id} ${e.name}`.toLowerCase().includes(q)) && (!a.category || e.category === a.category));
            return { total: rows.length, identifiers: rows.slice(0, 100).map((e) => ({ id: e.id, name: e.name, category: e.category, greek: e.greek, version: e.version, createdAt: e.createdAt })) };
          },
        },
        {
          name: "bcx_next_identifier",
          description: "Calcule le prochain identifiant libre pour une catégorie et une série grecque, sans rien créer.",
          parameters: { type: "object", properties: { category: { type: "string", enum: categoryEnum }, greek: { type: "string", enum: greekEnum } }, required: ["category", "greek"] },
          write: false,
          label: (a) => `Prochain code ${str(a.category)}-${str(a.greek)}`,
          run: async (a) => {
            const all = await listCloud(supabase);
            return { identifier: formatCode(str(a.category), str(a.greek), nextSerial(all.map((e) => e.id), str(a.category), str(a.greek))) };
          },
        },
        {
          name: "bcx_create_identifier",
          description: "[ÉCRITURE — validation de l'utilisateur requise] Crée un identifiant BCX dans le registre partagé.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nom du projet" },
              category: { type: "string", enum: categoryEnum },
              greek: { type: "string", enum: greekEnum },
              version: { type: "string", description: "Version X.Y.Z, 1.0.0 par défaut" },
            },
            required: ["name", "category", "greek"],
          },
          write: true,
          label: (a) => `Créer l'identifiant « ${str(a.name, 80)} » (${str(a.category)} · ${str(a.greek)})`,
          run: async (a) => {
            const version = str(a.version) || "1.0.0";
            if (!isValidVersion(version)) return { error: "Version invalide : format X.Y.Z attendu." };
            if (!categoryEnum.includes(str(a.category)) || !greekEnum.includes(str(a.greek))) return { error: "Catégorie ou série grecque inconnue." };
            const all = await listCloud(supabase);
            const entry = await createCloud(supabase, userId, all, { name: str(a.name, 120).trim(), category: str(a.category), greek: str(a.greek), version });
            return { created: entry.id, name: entry.name };
          },
        },
      ],
    };
  },
};
