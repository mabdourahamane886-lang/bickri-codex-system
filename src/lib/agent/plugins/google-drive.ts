import "server-only";
import { str, type Plugin } from "../types";

type DriveFile = { id?: string; name?: string; mimeType?: string; webViewLink?: string; modifiedTime?: string; size?: string };

async function getDriveToken(): Promise<string> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Configure GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET et GOOGLE_DRIVE_REFRESH_TOKEN dans les variables serveur.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json() as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Impossible d'obtenir un jeton Google Drive.");
  return data.access_token;
}

async function driveRequest<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Google Drive a renvoyé HTTP ${response.status}.`);
  return await response.json() as T;
}

export const drivePlugin: Plugin = {
  id: "google-drive",
  name: "Google Drive",
  description: "Recherche des fichiers Google Drive accessibles à l'intégration et lit le contenu textuel pris en charge.",
  async load(ctx) {
    if (!ctx.user) return { tools: [], reason: "Connecte-toi à BCX pour utiliser Google Drive." };
    const configured = Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
    if (!configured) return { tools: [], reason: "À configurer : ajoute les identifiants OAuth Google Drive dans les variables serveur BCX." };
    return { tools: [
      {
        name: "google_drive_search",
        description: "Recherche des fichiers dans le Google Drive autorisé à l'intégration. Retourne nom, type, date de modification et lien, sans modifier les fichiers.",
        parameters: { type: "object", properties: { query: { type: "string", description: "Mots-clés du nom ou du contenu du fichier" } }, required: ["query"] },
        write: false, label: (a) => `Rechercher dans Google Drive : ${str(a.query, 80)}`,
        run: async (a) => {
          const query = str(a.query, 300).trim();
          if (!query) return { error: "Saisis des mots-clés pour rechercher un fichier." };
          const token = await getDriveToken();
          const folder = process.env.GOOGLE_DRIVE_FOLDER_ID;
          const clauses = ["trashed = false", `(name contains '${query.replace(/\\/g, "\\\\").replace(/'/g, "\\'")} ' or fullText contains '${query.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')`.replace(/' /g, "'")];
          if (folder) clauses.push(`'${folder.replace(/'/g, "")}' in parents`);
          const url = new URL("https://www.googleapis.com/drive/v3/files");
          url.searchParams.set("q", clauses.join(" and "));
          url.searchParams.set("pageSize", "10");
          url.searchParams.set("orderBy", "modifiedTime desc");
          url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,modifiedTime,size)");
          const data = await driveRequest<{ files?: DriveFile[] }>(url.href, token);
          return { query, files: (data.files ?? []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, url: f.webViewLink, modifiedTime: f.modifiedTime, size: f.size })) };
        },
      },
      {
        name: "google_drive_read_text",
        description: "Lit le texte d'un fichier accessible dans Google Drive. Prend en charge Google Docs et les fichiers texte/CSV/JSON/Markdown. Lecture seule.",
        parameters: { type: "object", properties: { fileId: { type: "string", description: "ID exact du fichier renvoyé par google_drive_search" } }, required: ["fileId"] },
        write: false, label: (a) => `Lire un fichier Google Drive : ${str(a.fileId, 60)}`,
        run: async (a) => {
          const fileId = str(a.fileId, 200).trim();
          if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) return { error: "ID de fichier invalide." };
          const token = await getDriveToken();
          const file = await driveRequest<DriveFile>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink`, token);
          const exportable = new Set(["application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet"]);
          const textMime = /^(text\/(plain|csv|markdown)|application\/(json|xml))$/i.test(file.mimeType ?? "");
          if (!exportable.has(file.mimeType ?? "") && !textMime) return { error: `Le type ${file.mimeType || "inconnu"} n'est pas pris en charge pour l'extraction textuelle.`, name: file.name, url: file.webViewLink };
          const endpoint = exportable.has(file.mimeType ?? "")
            ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
            : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
          const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
          if (!response.ok) return { error: `Lecture du fichier impossible (HTTP ${response.status}).`, name: file.name };
          const content = (await response.text()).slice(0, 18000);
          return { name: file.name, mimeType: file.mimeType, url: file.webViewLink, content, truncated: content.length >= 18000 };
        },
      },
    ] };
  },
};
