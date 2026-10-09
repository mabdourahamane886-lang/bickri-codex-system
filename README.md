# BICKRI CODEX SYSTEM (BCX)

BCX is the BICKRI project identifier registry and the foundation for a cloud-based multilingual development workspace.

## Current state
- Responsive BCX identifier registry UI and identifier generator.
- BCX Studio browser-side prototype for HTML/CSS/JavaScript editing and sandboxed preview.
- Supabase email/password account screen and auth callback route.
- SQL migrations for the BCX registry schema, user profiles, and owner-scoped product writes.
- Bickri Code AI chat UI and server-side API route are implemented; a provider API key is required.
- BCX Cloud capability dashboard describes project storage, editor, terminal, build workers, AI and GitHub integration status.
- Cloud terminal, isolated build containers, Flutter/Android compilation, persistent cloud files and GitHub sync are NOT implemented yet.

## Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Supabase Auth, PostgreSQL and Row Level Security
- Monaco desktop / CodeMirror 6 mobile planned for the full editor
- Isolated Linux worker/container service planned for terminals, builds and tests
- GitHub integration and AI coding assistant planned

## AI coding assistant
Configure these variables in Vercel Project Settings → Environment Variables, then redeploy:

OPENAI_API_KEY=your_server_side_api_key
OPENAI_MODEL=gpt-4o-mini

`OPENAI_API_KEY` is server-only: do not prefix it with `NEXT_PUBLIC_` and never commit its value. The assistant is available at `/ai` and its server endpoint is `/api/ai/code`. Requests are length-limited, but production deployment should also add authenticated access, per-user quotas and abuse monitoring before public launch.

## Cloud infrastructure status
The `/cloud` page is a capability dashboard, not a running remote-compute service. A real cloud IDE still needs a separately deployed, isolated worker service for terminals/builds, private object storage, job queue, authenticated WebSocket gateway, quotas/timeouts and runtime images. Never run untrusted code inside the Next.js web process. Flutter Android builds additionally need a worker image containing the Flutter, JDK and Android SDK toolchains.

## Environment
Copy .env.example to .env.local and configure the dedicated BCX Supabase project, not Bickri Service Agency:

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_BCX_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME

The expected BCX project reference is ahyjrpeweniwrnuedkux. Copy its URL and publishable key from the Supabase API settings. Never expose a service_role key in browser code or a NEXT_PUBLIC variable.

## Database setup
Apply the SQL migrations in order to the dedicated BCX project only:
1. supabase/migrations/202610090001_initial_schema.sql
2. supabase/migrations/202610090002_auth_profiles_and_owner_access.sql

Review and test SQL before production. New accounts receive the least-privileged viewer role. Owner policies allow users to manage only products whose owner_user_id is their own. Elevated roles must be granted through a trusted administrator process.

## Local development
Run npm install, then npm run dev. Open http://localhost:3000 and use /login after configuring Supabase.

## Deployment checklist
- Verify Vercel is connected to this repository and main branch.
- Configure the two public Supabase environment variables for Preview and Production.
- Apply both migrations to the dedicated BCX Supabase project.
- Configure Supabase Auth site URL and redirect URL for the deployed domain, including /auth/callback.
- Test sign-up, email confirmation, sign-in, sign-out and session expiry.
- Confirm RLS prevents one account from changing another account's products.
- Keep Vercel deployment protection intentional; disable it only if the site is meant to be public.
- Add cloud workers only with non-root execution, quotas, network restrictions, timeouts and short-lived credentials.

## Roadmap
1. Stabilize deployment and configure Supabase auth/database.
2. Connect registry CRUD to PostgreSQL.
3. Replace Studio textareas with Monaco/CodeMirror and a file explorer.
4. Add isolated cloud sessions, terminal, logs and preview ports.
5. Add web/Node/Python runtimes, then compiled languages.
6. Add Flutter/Dart/Android build workers and APK/AAB artifacts.
7. Add project-aware AI, GitHub import/commit/sync and deployment integration.
8. Complete security review, quotas, monitoring, backups and production readiness.