import "server-only";
import type { Plugin } from "../types";
import { str } from "../types";

type Provider = "vercel" | "cloudflare" | "netlify";

const PREVIEW_HOOKS: Record<Provider, string> = {
  vercel: "VERCEL_PREVIEW_DEPLOY_HOOK_URL",
  cloudflare: "CLOUDFLARE_PREVIEW_DEPLOY_HOOK_URL",
  netlify: "NETLIFY_PREVIEW_BUILD_HOOK_URL",
};

function configuredProviders() {
  return (Object.entries(PREVIEW_HOOKS) as [Provider, string][]).map(([provider, envName]) => ({
    provider,
    configured: Boolean(process.env[envName]),
    mode: "preview-hook",
    secretName: envName,
  }));
}

async function triggerHook(provider: Provider) {
  const envName = PREVIEW_HOOKS[provider];
  const hookUrl = process.env[envName];
  if (!hookUrl) return { error: `Le hook Preview de ${provider} n'est pas configuré. Ajoute ${envName} dans les variables serveur.` };

  let url: URL;
  try { url = new URL(hookUrl); } catch { return { error: `L'URL configurée pour ${provider} est invalide.` }; }
  if (url.protocol !== "https:") return { error: "Le hook de déploiement doit utiliser HTTPS." };

  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    return { error: `Le fournisseur ${provider} a refusé le déclenchement (HTTP ${response.status}).`, provider, httpStatus: response.status };
  }
  let result: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    result = await response.json().catch(() => null);
  } else {
    result = (await response.text().catch(() => "")).slice(0, 500);
  }
  return {
    success: true,
    provider,
    target: "preview",
    accepted: true,
    statusCode: response.status,
    result,
    note: "Le fournisseur a accepté le hook. Cela ne prouve pas encore que le build a réussi; vérifie le statut dans le tableau de bord du fournisseur.",
  };
}

export const deploymentsPlugin: Plugin = {
  id: "deployments",
  name: "Déploiements CI/CD",
  description: "Vérifier les fournisseurs configurés et déclencher des déploiements Preview sur Vercel, Cloudflare ou Netlify.",
  async load(ctx) {
    if (!ctx.user) return { tools: [], reason: "Connecte-toi pour utiliser les déploiements." };
    return {
      tools: [
        {
          name: "bcx_deployment_providers",
          description: "Liste les fournisseurs de déploiement configurés dans BCX. Ne révèle jamais les valeurs des secrets.",
          parameters: { type: "object", properties: {} },
          write: false,
          label: () => "Vérifier les fournisseurs de déploiement",
          run: async () => ({
            providers: configuredProviders().map(({ provider, configured, mode }) => ({ provider, configured, mode })),
            productionDeployments: "non activés par cet outil; les déploiements de production nécessitent un workflow séparé et une confirmation explicite",
          }),
        },
        {
          name: "bcx_trigger_preview_deployment",
          description: "[ÉCRITURE — confirmation utilisateur requise] Déclenche un hook de déploiement Preview. Fournisseurs pris en charge : vercel, cloudflare, netlify. Ne déclenche jamais la production.",
          parameters: {
            type: "object",
            properties: {
              provider: { type: "string", enum: ["vercel", "cloudflare", "netlify"], description: "Fournisseur cible" },
              reason: { type: "string", description: "Motif bref du déploiement" },
            },
            required: ["provider", "reason"],
          },
          write: true,
          label: (args) => `Déployer une Preview sur ${str(args.provider, 30)} · ${str(args.reason, 80)}`,
          run: async (args, currentCtx) => {
            if (!currentCtx.trusted) return { error: "Action réservée à un compte administrateur ou éditeur BCX." };
            const provider = str(args.provider).toLowerCase() as Provider;
            if (!(provider in PREVIEW_HOOKS)) return { error: "Fournisseur non pris en charge." };
            const reason = str(args.reason, 200).trim();
            if (!reason) return { error: "Un motif est obligatoire." };
            return { reason, ...(await triggerHook(provider)) };
          },
        },
      ],
    };
  },
};
