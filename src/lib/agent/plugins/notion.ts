import "server-only";
import { str, type Plugin } from "../types";

type NotionRichText = { plain_text?: string };
type NotionBlock = { id?: string; type?: string; has_children?: boolean; [key: string]: unknown };
const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

async function notionRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error("NOTION_API_KEY n'est pas configurée.");
  const response = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json() as T & { message?: string; code?: string };
  if (!response.ok) throw new Error(data.message || `Notion a renvoyé HTTP ${response.status}.`);
  return data;
}

function titleOf(page: Record<string, unknown>): string {
  const properties = page.properties as Record<string, { title?: NotionRichText[] }> | undefined;
  const titleProperty = Object.values(properties ?? {}).find((p) => Array.isArray(p.title));
  const title = (titleProperty?.title ?? []).map((r) => r.plain_text ?? "").join("");
  return title || "Page sans titre";
}
function blockText(block: NotionBlock): string {
  const value = block[block.type || ""] as { rich_text?: NotionRichText[]; title?: NotionRichText[] } | undefined;
  return (value?.rich_text ?? value?.title ?? []).map((r) => r.plain_text ?? "").join("");
}

export const notionPlugin: Plugin = {
  id: "notion",
  name: "Notion",
  description: "Recherche les pages Notion partagées avec l'intégration et lit leur contenu textuel. Lecture seule.",
  async load(ctx) {
    if (!ctx.user) return { tools: [], reason: "Connecte-toi à BCX pour utiliser Notion." };
    if (!process.env.NOTION_API_KEY) return { tools: [], reason: "À configurer : ajoute NOTION_API_KEY dans les variables serveur BCX et partage les pages voulues avec l'intégration Notion." };
    return { tools: [
      {
        name: "notion_search_pages",
        description: "Recherche des pages Notion auxquelles l'intégration a accès. Retourne le titre, l'ID et l'URL; ne prétends pas voir les pages non partagées.",
        parameters: { type: "object", properties: { query: { type: "string", description: "Titre ou mots-clés à rechercher" } }, required: ["query"] },
        write: false, label: (a) => `Rechercher dans Notion : ${str(a.query, 80)}`,
        run: async (a) => {
          const query = str(a.query, 300).trim();
          if (!query) return { error: "Saisis un terme de recherche." };
          const data = await notionRequest<{ results?: Array<Record<string, unknown>> }>("/search", { query, page_size: 10, sort: { direction: "descending", timestamp: "last_edited_time" } });
          return { query, pages: (data.results ?? []).filter((p) => p.object === "page").map((p) => ({ id: p.id, title: titleOf(p), url: p.url, lastEditedTime: p.last_edited_time })) };
        },
      },
      {
        name: "notion_read_page",
        description: "Lit les blocs textuels d'une page Notion partagée avec l'intégration, en suivant la pagination et jusqu'à 3 niveaux de blocs enfants. Lecture seule.",
        parameters: { type: "object", properties: { pageId: { type: "string", description: "ID de page obtenu via notion_search_pages" } }, required: ["pageId"] },
        write: false, label: (a) => `Lire une page Notion : ${str(a.pageId, 60)}`,
        run: async (a) => {
          const pageId = str(a.pageId, 100).trim();
          if (!/^[a-fA-F0-9-]{32,36}$/.test(pageId)) return { error: "ID de page Notion invalide." };
          const lines: string[] = [];
          async function readChildren(parentId: string, depth: number): Promise<void> {
            let cursor = "";
            do {
              const qs = new URLSearchParams({ page_size: "100" });
              if (cursor) qs.set("start_cursor", cursor);
              const data = await notionRequest<{ results?: NotionBlock[]; has_more?: boolean; next_cursor?: string | null }>(`/blocks/${encodeURIComponent(parentId)}/children?${qs.toString()}`);
              for (const block of data.results ?? []) {
                const text = blockText(block);
                if (text) lines.push(`${"  ".repeat(depth)}${text}`);
                if (block.has_children && depth < 3 && block.id) await readChildren(block.id, depth + 1);
                if (lines.join("\n").length > 18000) return;
              }
              cursor = data.has_more ? (data.next_cursor ?? "") : "";
            } while (cursor && lines.join("\n").length <= 18000);
          }
          await readChildren(pageId, 0);
          return { pageId, content: lines.join("\n").slice(0, 18000), truncated: lines.join("\n").length > 18000 };
        },
      },
    ] };
  },
};
