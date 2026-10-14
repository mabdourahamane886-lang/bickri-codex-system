import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { toGeminiSchema } from "../schema";
import { str, type Plugin, type Tool } from "../types";

/** Outils MCP exposés à l'IA. Lecture et écriture pour les comptes connectés, limitées aux dépôts autorisés. */
const READ: Record<string, string> = {
  get_me: "Identifier le compte GitHub",
  get_file_contents: "Lire un fichier ou un dossier",
  search_repositories: "Chercher des dépôts",
  search_code: "Chercher dans le code",
  search_commits: "Chercher des commits",
  search_issues: "Chercher des tickets",
  search_pull_requests: "Chercher des pull requests",
  list_branches: "Lister les branches",
  list_commits: "Lister les commits",
  get_commit: "Lire un commit",
  list_tags: "Lister les tags",
  list_issues: "Lister les tickets",
  issue_read: "Lire un ticket",
  list_pull_requests: "Lister les pull requests",
  pull_request_read: "Lire une pull request",
  list_releases: "Lister les versions publiées",
  get_latest_release: "Lire la dernière version publiée",
};
const WRITE: Record<string, string> = {
  create_branch: "Créer une branche",
  create_or_update_file: "Écrire un fichier",
  push_files: "Pousser plusieurs fichiers",
  create_pull_request: "Ouvrir une pull request",
  update_pull_request: "Modifier une pull request",
  issue_write: "Créer ou modifier un ticket",
  add_issue_comment: "Commenter un ticket",
};

// Ancien nom affiché par certaines sessions : rediriger vers le dépôt GitHub réel.
const REPOSITORY_ALIASES: Record<string, string> = {
  bickristudioai: "bickriaistudio",
};

function canonicalRepoName(name: string): string {
  return REPOSITORY_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
}

function allowedOwners(): string[] {
  return (process.env.GITHUB_ALLOWED_OWNERS || "mabdourahamane886-lang").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Dépôts explicitement autorisés à la lecture et à l'écriture pour tous les comptes connectés. */
function allowedRepositories(): string[] {
  return (process.env.GITHUB_ALLOWED_REPOSITORIES || "mabdourahamane886-lang/bickri-codex-system,mabdourahamane886-lang/bickriaistudio")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    .map((fullName) => {
      const [owner, repo] = fullName.split("/");
      return owner && repo ? `${owner}/${canonicalRepoName(repo)}` : fullName;
    });
}

function resultText(result: unknown): { text: string; isError: boolean } {
  const r = (result ?? {}) as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  const text = (r.content ?? []).filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n");
  return { text: text.length > 20000 ? text.slice(0, 20000) + "\n…[contenu tronqué]" : text, isError: Boolean(r.isError) };
}

function describe(name: string, args: Record<string, unknown>): string {
  const base = READ[name] ?? WRITE[name] ?? name;
  const repo = args.owner && args.repo ? `${str(args.owner)}/${str(args.repo)}` : "";
  const target = str(args.path || args.branch || args.title || args.query || args.pullNumber || args.issue_number, 120);
  return [base, repo, target].filter(Boolean).join(" · ");
}

export const githubPlugin: Plugin = {
  id: "github",
  name: "GitHub",
  description: "Lire et modifier les dépôts autorisés pour les utilisateurs connectés, après approbation de chaque écriture.",
  async load(ctx) {
    const endpoint = process.env.GITHUB_MCP_URL;
    if (!endpoint) return { tools: [], reason: "GITHUB_MCP_URL n'est pas configurée." };
    if (!ctx.user) return { tools: [], reason: "Connecte-toi pour accéder à GitHub." };

    const headers: Record<string, string> = {};
    if (process.env.GITHUB_MCP_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_MCP_BEARER_TOKEN}`;
    const client = new Client({ name: "bickri-code-ai-agent", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers } }));
      const { tools: remote } = await client.listTools();
      const owners = allowedOwners();
      const repositories = allowedRepositories();

      const tools: Tool[] = remote
        .filter((t) => ctx.trusted
          ? (t.name in READ || t.name in WRITE)
          : ([
              "get_me", "get_file_contents", "list_branches", "list_commits", "get_commit",
              "list_tags", "list_issues", "issue_read", "list_pull_requests", "pull_request_read",
              "list_releases", "get_latest_release",
            ].includes(t.name) || t.name in WRITE))
        .map((t) => {
          const write = t.name in WRITE;
          const params = toGeminiSchema(t.inputSchema);
          return {
            name: `github_${t.name}`,
            description: `${write ? "[ÉCRITURE — validation de l'utilisateur requise] " : ""}${(t.description ?? READ[t.name] ?? WRITE[t.name]).slice(0, 900)}`,
            parameters: params && params.type === "object" ? params : undefined,
            write,
            label: (args) => describe(t.name, args),
            run: async (args) => {
              const owner = str(args.owner).toLowerCase();
              const requestedRepo = str(args.repo).toLowerCase();
              const repoName = canonicalRepoName(requestedRepo);
              if (owner && !owners.includes(owner)) {
                return { error: `Accès refusé : seul le ou les comptes ${owners.join(", ")} sont autorisés (GITHUB_ALLOWED_OWNERS).` };
              }
              // Toute lecture/écriture ciblant un dépôt doit rester dans la liste autorisée,
              // quel que soit le rôle. get_me est la seule action sans dépôt.
              if (t.name !== "get_me") {
                if (!owner || !repoName) return { error: "Accès refusé : cette action doit cibler un dépôt autorisé." };
                if (!repositories.includes(`${owner}/${repoName}`)) {
                  return { error: `Accès refusé : dépôt non autorisé. Dépôts permis : ${repositories.join(", ")} (GITHUB_ALLOWED_REPOSITORIES).` };
                }
              }
              const normalizedArgs = requestedRepo ? { ...args, repo: repoName } : args;
              const res = resultText(await client.callTool({ name: t.name, arguments: normalizedArgs }));
              return res.isError ? { error: res.text || "Erreur GitHub." } : { result: res.text };
            },
          };
        });
      return { tools, close: () => client.close().catch(() => undefined) };
    } catch (err) {
      await client.close().catch(() => undefined);
      return { tools: [], reason: `Connexion au serveur GitHub MCP impossible : ${err instanceof Error ? err.message.slice(0, 200) : "erreur inconnue"}` };
    }
  },
};
