import { NextRequest, NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const runtime = "nodejs";
export const maxDuration = 20;

function parseRepository(input: unknown): { owner: string; repo: string } | null {
  if (typeof input !== "string") return null;
  const match = input.trim().match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

function textFromResult(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result) || !Array.isArray((result as {content: unknown[]}).content)) return "";
  return (result as {content: Array<{type?: string; text?: string}>}).content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .slice(0, 7000);
}

export async function POST(request: NextRequest) {
  const endpoint = process.env.GITHUB_MCP_URL;
  if (!endpoint) {
    return NextResponse.json({
      error: "Le client MCP est installé, mais GITHUB_MCP_URL n'est pas configurée dans Vercel. Configure l'URL d'un serveur GitHub MCP distant compatible Streamable HTTP, puis redéploie.",
      mcpConfigured: false,
    }, { status: 503 });
  }

  let body: { repository?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 }); }

  const parsed = parseRepository(body.repository);
  if (!parsed) return NextResponse.json({ error: "Indique un dépôt au format propriétaire/depot ou une URL GitHub." }, { status: 400 });

  let client: Client | undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return NextResponse.json({ error: "Le serveur MCP distant doit utiliser HTTPS." }, { status: 500 });
    }
    const headers: Record<string, string> = {};
    if (process.env.GITHUB_MCP_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_MCP_BEARER_TOKEN}`;
    const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
    client = new Client({ name: "bickri-code-ai", version: "1.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();

    // Only read-only repository tools are exposed by this route.
    const allowedReadTools = new Set(["get_file_contents", "search_code", "search_repositories", "get_commit", "list_commits", "list_branches", "list_pull_requests"]);
    const availableReadTools = tools.filter((tool) => allowedReadTools.has(tool.name));
    const readmeTool = availableReadTools.find((tool) => tool.name === "get_file_contents");
    let readme = "";
    let readmeSource = "Le serveur MCP ne propose pas l'outil get_file_contents.";
    if (readmeTool) {
      try {
        const result = await client.callTool({ name: readmeTool.name, arguments: { owner: parsed.owner, repo: parsed.repo, path: "README.md" } });
        readme = textFromResult(result);
        if (readme) readmeSource = "README récupéré par GitHub MCP.";
      } catch {
        readmeSource = "Le serveur MCP est joignable, mais la lecture du README a échoué (outil ou schéma d'arguments différent).";
      }
    }

    return NextResponse.json({
      mcpConfigured: true,
      mcpConnected: true,
      repository: `${parsed.owner}/${parsed.repo}`,
      tools: availableReadTools.map((tool) => ({ name: tool.name, description: tool.description || "" })),
      context: [
        `DÉPÔT GITHUB : ${parsed.owner}/${parsed.repo}`,
        "Connexion au serveur MCP GitHub réussie.",
        `Outils MCP en lecture seule détectés : ${availableReadTools.map((tool) => tool.name).join(", ") || "aucun outil reconnu"}.`,
        readmeSource,
        readme ? `README (extrait) :\n${readme}` : "",
        "Sécurité : cette route n'autorise aucun outil d'écriture; aucun commit, push ou pull request n'a été créé.",
      ].filter(Boolean).join("\n\n").slice(0, 12000),
    });
  } catch (error) {
    console.error("GitHub MCP connection error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({
      error: "Connexion au serveur GitHub MCP impossible. Vérifie GITHUB_MCP_URL, son transport Streamable HTTP, et le jeton éventuel.",
      mcpConfigured: true,
      mcpConnected: false,
    }, { status: 502 });
  } finally {
    if (client) await client.close().catch(() => undefined);
  }
}
