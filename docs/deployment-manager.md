# BCX Deployment Manager

BCX exposes a deployment plugin to the coding agent. It currently supports provider readiness checks and **Preview-only** deployment hooks for Vercel, Cloudflare, and Netlify. Production deployment is intentionally not enabled by this plugin.

## Configure Preview hooks

Set these server-side environment variables in the BCX hosting platform (for example, Vercel Project Settings → Environment Variables):

- `VERCEL_PREVIEW_DEPLOY_HOOK_URL`: a Vercel Deploy Hook configured for a non-production branch.
- `CLOUDFLARE_PREVIEW_DEPLOY_HOOK_URL`: an HTTPS endpoint you control that safely triggers a Cloudflare Workers/Pages Preview build. Cloudflare does not provide one universal deploy-hook URL for every Workers project; configure the endpoint for your chosen CI/CD workflow.
- `NETLIFY_PREVIEW_BUILD_HOOK_URL`: a Netlify Build Hook configured for a non-production branch/context.

Only set hooks that are configured for Preview. These URLs are bearer-like secrets: do not commit their values, expose them to browser code, or print them in logs. If any hook is leaked, rotate it in the provider dashboard.

## Agent workflow

1. Enable the **Déploiements CI/CD** plugin in BCX.
2. Ask the agent to check configured providers.
3. Ask for a Preview deployment. The agent proposes a write action and BCX asks for approval before execution.
4. The server verifies the caller is an authenticated BCX admin/editor and triggers the selected hook.
5. The response reports whether the provider accepted the trigger. Acceptance is not build success; verify the final status in the provider dashboard.

For Vercel projects connected to GitHub, pushes to a connected branch may already trigger deployments automatically. Prefer that native integration to avoid duplicate builds. Configure the Vercel hook for a non-production branch only.

## Limitations

- This plugin does not write Git commits; use the existing GitHub plugin for branch and commit operations.
- This plugin triggers configured Preview hooks; it does not poll build logs or claim deployment success.
- It does not perform production deployments or rollbacks.
- Cloudflare hook behavior depends on the custom HTTPS endpoint/CI workflow configured by the project owner.
- All provider credentials must remain server-side.
