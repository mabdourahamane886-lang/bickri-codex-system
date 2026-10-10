import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

function parseRepository(input: unknown): { owner: string; repo: string } | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  const match = value.match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?(?:\.git)?$/);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  if (!owner || !repo || owner.length > 100 || repo.length > 100) return null;
  return { owner, repo };
}

async function githubGet(url: string) {
  return fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Bickri-Code-AI",
    },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
}

export async function POST(request: NextRequest) {
  let body: { repository?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const parsed = parseRepository(body.repository);
  if (!parsed) {
    return NextResponse.json({
      error: "Indique un dépôt public sous la forme propriétaire/depot ou https://github.com/proprietaire/depot.",
    }, { status: 400 });
  }

  try {
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const repoResponse = await githubGet(base);
    if (repoResponse.status === 404) {
      return NextResponse.json({ error: "Dépôt introuvable ou privé. Cette connexion sans token prend uniquement en charge les dépôts publics." }, { status: 404 });
    }
    if (repoResponse.status === 403 || repoResponse.status === 429) {
      return NextResponse.json({ error: "GitHub limite temporairement les requêtes. Réessaie plus tard." }, { status: 429 });
    }
    if (!repoResponse.ok) {
      return NextResponse.json({ error: `GitHub a renvoyé HTTP ${repoResponse.status}.` }, { status: 502 });
    }

    const repoData = await repoResponse.json();
    const branch = typeof repoData.default_branch === "string" ? repoData.default_branch : "main";
    const [readmeResponse, treeResponse] = await Promise.all([
      githubGet(`${base}/readme`),
      githubGet(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`),
    ]);

    let readme = "";
    if (readmeResponse.ok) {
      const readmeData = await readmeResponse.json();
      if (typeof readmeData.content === "string" && readmeData.encoding === "base64") {
        try {
          readme = Buffer.from(readmeData.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, 7000);
        } catch {
          readme = "";
        }
      }
    }

    let fileList = "Liste des fichiers indisponible.";
    if (treeResponse.ok) {
      const treeData = await treeResponse.json();
      const paths = Array.isArray(treeData.tree)
        ? treeData.tree
            .filter((item: { type?: string; path?: string }) =>
              item.type === "blob" &&
              typeof item.path === "string" &&
              !/(^|\/)(node_modules|\.git|\.next|dist|build|coverage|vendor)(\/|$)/.test(item.path) &&
              !/\.(png|jpe?g|gif|webp|ico|pdf|zip|lock)$/i.test(item.path)
            )
            .map((item: { path: string }) => item.path)
            .slice(0, 100)
        : [];
      fileList = paths.length ? paths.join("\n") : "Aucun fichier source listé.";
    }

    const context = [
      `DÉPÔT GITHUB PUBLIC : ${repoData.full_name}`,
      `Description : ${repoData.description || "Non renseignée"}`,
      `Branche par défaut : ${branch}`,
      `Langages principaux (métadonnées GitHub) : ${JSON.stringify(repoData.language || "Non renseigné")}`,
      `URL : ${repoData.html_url}`,
      "MODE D'ACCÈS : lecture seule via l'API publique GitHub. Seuls les métadonnées, le README et les chemins de fichiers sont fournis; le contenu de tous les fichiers n'a pas été téléchargé.",
      "CHEMINS DE FICHIERS (liste partielle, maximum 100) :",
      fileList,
      readme ? `README (extrait) :\n${readme}` : "README indisponible ou absent.",
    ].join("\n\n").slice(0, 12000);

    return NextResponse.json({
      repository: { full_name: repoData.full_name, html_url: repoData.html_url, default_branch: branch },
      context,
    });
  } catch (error) {
    console.error("GitHub connector error", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Impossible de joindre GitHub. Vérifie le nom du dépôt et réessaie." }, { status: 502 });
  }
}
