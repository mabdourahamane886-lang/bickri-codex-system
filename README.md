# BICKRI CODEX SYSTEM (BCX)

Plateforme en français de l'écosystème BICKRI : registre d'identifiants, studio de code dans le navigateur et assistant de programmation IA **Bickri Code AI**.

## Modules

| Route | Module | Capacités |
| --- | --- | --- |
| `/` | Tableau de bord | Indicateurs calculés depuis les données disponibles, derniers identifiants et état des services |
| `/registry` | Registre BCX | Création, recherche, filtres, export CSV, synchronisation Supabase avec mode local |
| `/studio` | Studio | CodeMirror 6 (HTML/CSS/JS), aperçu ordinateur/tablette/mobile, console, modèles, export et aide IA |
| `/ai` | Bickri Code AI | Chat Markdown, blocs de code copiables, langage choisi, outils/plugins et contexte GitHub autorisé |
| `/plugins` | Plugins | Catalogue autonome des outils disponibles pour la session |
| `/cloud` | BCX Cloud | État des intégrations configurées et feuille de route explicite |
| `/settings` | Paramètres | État de configuration booléen, compte, thème et données locales |
| `/login` | Connexion | Inscription et connexion par e-mail via Supabase Auth |
| `/auth/callback` | Callback | Échange du code de confirmation et redirection interne sûre |

Le terminal cloud, les conteneurs de build, la compilation Flutter/Android et le stockage cloud des fichiers ne sont pas inclus dans cette version ; ils sont présentés comme fonctionnalités à venir.

## Stack

- Next.js 15 App Router, React 19, TypeScript strict, Geist
- Supabase Auth, PostgreSQL et Row Level Security (RLS)
- CodeMirror 6, `react-markdown`, `remark-gfm`, `lucide-react`
- Fournisseurs IA : Gemini en priorité, Anthropic Claude sélectionnable, API compatible OpenAI/OpenRouter en repli
- Vitest, ESLint, GitHub Actions
- Déploiement Vercel ; compatibilité Cloudflare possible via OpenNext selon la configuration d'hébergement

## Développement local

Prérequis : Node.js 20 ou supérieur et npm.

```bash
git clone https://github.com/mabdourahamane886-lang/bickri-codex-system.git
cd bickri-codex-system
npm ci
cp .env.example .env.local
npm run dev
```

L'application est disponible sur http://localhost:3000. Sans variables Supabase, le registre et le projet du studio doivent rester utilisables localement dans le navigateur. Les fonctions nécessitant un fournisseur externe affichent leur état non configuré.

Avant une pull request :

```bash
npm run check
npm run build
```

La CI GitHub exécute `npm run check` à chaque push sur `main` et à chaque pull request vers `main`.

## Configuration Supabase

1. Crée un projet Supabase et copie son URL ainsi que sa clé publishable dans `.env.local` ou dans les variables d'environnement de l'hébergeur.
2. Applique dans l'ordre les migrations présentes dans `supabase/migrations/` via Supabase CLI ou l'éditeur SQL. N'exécute pas les migrations dans un ordre différent.
3. Dans **Authentication → URL Configuration**, définis l'URL du site et ajoute `http://localhost:3000/auth/callback` ainsi que l'URL de production terminée par `/auth/callback` dans les URL de redirection autorisées.
4. Les nouveaux comptes commencent avec le rôle `viewer`. Les rôles `editor` et `admin` doivent être attribués par un administrateur. Les politiques RLS restent la barrière d'autorisation côté base.

Sans Supabase configuré, le mode local ne nécessite pas de connexion et stocke les données dans le navigateur de l'utilisateur.

## Variables d'environnement

Copie `.env.example` et remplace les valeurs de démonstration. Les clés privées doivent rester côté serveur : ne préfixe jamais une clé secrète par `NEXT_PUBLIC_`. N'expose jamais une clé Supabase `service_role`.

Variables principales :

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `AI_PROVIDER` (`auto`, `google`, `anthropic`, `openai`, `openrouter`)
- Anthropic Claude : `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (sélectionne explicitement `AI_PROVIDER=anthropic` pour tester Anthropic sans bascule automatique vers un autre fournisseur)
- Gemini : `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`
- OpenAI/OpenRouter : `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- `TAVILY_API_KEY`
- `GITHUB_MCP_URL`, `GITHUB_MCP_BEARER_TOKEN`, `GITHUB_ALLOWED_OWNERS`, `GITHUB_ALLOWED_REPOSITORIES`, `BCX_ADMIN_EMAILS`
- `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID`
- `NOTION_API_KEY`

Les routes de santé ne retournent que des booléens de configuration et ne divulguent aucune valeur de variable.

## Format du registre

Format : `BCX-<CATÉGORIE>-<SÉRIE GRECQUE>-<NUMÉRO>`, par exemple `BCX-AI-THETA-001`.

- Catégories autorisées : `AI`, `APP`, `WEB`, `SYS`, `SEC`, `LAB`.
- Séries : les 24 lettres grecques, de `ALPHA` à `OMEGA`.
- Numéro séquentiel unique par couple catégorie/série, sur trois chiffres minimum.
- Les règles de validation et le calcul du prochain code sont testés dans Vitest.

## Sécurité et limites

- En-têtes de sécurité configurés dans Next.js.
- Middleware de rafraîchissement de session Supabase ; mode sans Supabase pris en charge.
- Redirections de callback limitées aux chemins internes.
- Limitation de débit en mémoire : 20 requêtes/minute pour l'API de code et 30/minute pour l'agent. En serverless, ce limiteur est « best effort » par instance ; utiliser un stockage partagé pour un quota distribué strict.
- Le contexte GitHub est limité aux propriétaires et dépôts autorisés. Les actions d'écriture des plugins doivent demander une approbation explicite et les secrets ne sont jamais envoyés au navigateur.
- Les contenus retournés par des outils externes doivent être traités comme des données non fiables, jamais comme des instructions système.

## Déploiement Vercel

1. Importe le dépôt GitHub dans Vercel.
2. Ajoute les variables nécessaires dans **Project → Settings → Environment Variables** (Preview/Production selon le besoin).
3. Configure dans Supabase l'URL du site et la redirection `https://TON-DOMAINE/auth/callback`.
4. Déploie et vérifie `/api/health`, puis les routes principales.
5. Après toute modification des variables d'environnement, déclenche un nouveau déploiement.

## Déploiement Cloudflare

Le projet peut être adapté à Cloudflare Workers via OpenNext. Configure l'adaptateur OpenNext compatible avec les versions Next.js et Cloudflare utilisées, puis vérifie les contraintes des routes Node.js et des fournisseurs externes avant de promouvoir en production. Le support Cloudflare n'est pas considéré comme validé tant qu'un build et un déploiement de bout en bout n'ont pas réussi.
