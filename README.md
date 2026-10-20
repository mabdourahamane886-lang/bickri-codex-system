# BICKRI CODEX SYSTEM (BCX)

Plateforme de l'écosystème BICKRI : registre officiel des identifiants produits, studio de code dans le navigateur et assistant de programmation **Bickri Code AI**.

## Fonctionnalités

| Module | Route | État |
| --- | --- | --- |
| Tableau de bord | `/` | Indicateurs réels, derniers identifiants, état des services |
| Registre BCX | `/registry` | Création, recherche, filtres, export CSV, synchronisation Supabase avec repli local |
| Studio de code | `/studio` | Éditeur CodeMirror (HTML/CSS/JS), aperçu ordinateur/tablette/mobile, console, modèles, export, assistant intégré |
| Bickri Code AI | `/ai` | Discussion avec rendu Markdown, blocs de code copiables, choix du langage, contexte de dépôt GitHub (MCP) |
| BCX Cloud | `/cloud` | État réel des briques de la plateforme et feuille de route |
| Paramètres | `/settings` | Vérification de la configuration, compte, thème, données locales |
| Connexion | `/login` | E-mail et mot de passe via Supabase Auth |

Non implémenté à ce jour : terminal cloud, conteneurs de build, compilation Flutter/Android, stockage cloud des fichiers.

## Format des identifiants

```
BCX-<CATÉGORIE>-<SÉRIE GRECQUE>-<NUMÉRO>
BCX-AI-THETA-001
```

- **Catégories** : `AI`, `APP`, `WEB`, `SYS`, `SEC`, `LAB`
- **Séries** : les 24 lettres grecques, d'ALPHA à OMEGA
- **Numéro** : séquentiel, unique par couple catégorie et série, sur 3 chiffres minimum

## Stack

- Next.js 15 (App Router), React 19, TypeScript strict
- Supabase Auth, PostgreSQL et Row Level Security
- CodeMirror 6, react-markdown, lucide-react, polices Geist
- Routeur IA multi-fournisseurs : Gemini en priorité, API compatible OpenAI/OpenRouter en repli pour l'endpoint de programmation
- Vitest, ESLint, GitHub Actions

## Structure

```
src/
  app/
    (app)/            pages avec la barre latérale (tableau de bord, registre, studio, ia, cloud, paramètres)
    api/ai/code       assistant IA (Gemini)
    api/ai/github     contexte de dépôt via un serveur GitHub MCP (lecture seule)
    api/health        état de configuration (booléens uniquement)
    auth/callback     confirmation e-mail Supabase
    login             connexion et inscription
  components/         shell, interface, éditeur, rendu Markdown, fournisseurs (session, thème)
  hooks/              useRegistry, useConfig
  lib/                règles BCX, registre, client Supabase, moteur IA, limiteur de débit
  middleware.ts       rafraîchissement de session Supabase
supabase/migrations/  schéma SQL du registre
```

## Variables d'environnement

Copie `.env.example` vers `.env.local` en local, ou configure-les dans **Vercel → Settings → Environment Variables** puis redéploie.

| Variable | Requise | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Oui | URL du projet Supabase BCX (`https://avgzbyvmsjjfgywtijno.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Oui | Clé publique Supabase |
| `AI_PROVIDER` | Non | `auto`, `google`, `openai` ou `openrouter` |
| `GEMINI_API_KEY` | Pour Gemini | Clé serveur Google AI Studio |
| `GEMINI_MODEL` | Non | Modèle Gemini principal |
| `GEMINI_FALLBACK_MODEL` | Non | Modèle Gemini de repli |
| `OPENAI_API_KEY` | Pour OpenAI/OpenRouter | Clé serveur compatible OpenAI |
| `OPENAI_BASE_URL` | Non | URL API ; OpenRouter : `https://openrouter.ai/api/v1` |
| `OPENAI_MODEL` | Non | Modèle compatible OpenAI |
| `TAVILY_API_KEY` | Pour la recherche | Recherche Web et contenus sociaux publics indexés |
| `GITHUB_MCP_URL` | Non | Serveur GitHub MCP distant (Streamable HTTP, HTTPS) |
| `GITHUB_MCP_BEARER_TOKEN` | Non | Jeton du serveur MCP |
| `BCX_ADMIN_EMAILS` | Non | E-mails (séparés par des virgules) des comptes autorisés à utiliser le plugin GitHub |
| `GITHUB_ALLOWED_OWNERS` | Non | Propriétaires GitHub autorisés pour les comptes de confiance (défaut : `mabdourahamane886-lang`) |
| `GITHUB_ALLOWED_REPOSITORIES` | Non | Dépôts accessibles en lecture et écriture à tous les comptes connectés (défaut : `mabdourahamane886-lang/bickri-codex-system`, liste séparée par des virgules) |
| `GOOGLE_DRIVE_CLIENT_ID` | Pour Google Drive | Identifiant OAuth côté serveur |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Pour Google Drive | Secret OAuth côté serveur |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Pour Google Drive | Jeton de renouvellement OAuth avec accès Drive en lecture seule |
| `GOOGLE_DRIVE_FOLDER_ID` | Non | Limite facultative des recherches à un dossier Drive |
| `NOTION_API_KEY` | Pour Notion | Jeton d'une intégration Notion interne ; partager les pages avec l'intégration |

Ne préfixe jamais une clé secrète par `NEXT_PUBLIC_` et n'expose jamais une clé `service_role`. La page `/settings` indique ce qui est configuré sans jamais afficher les valeurs.

## Plugins de Bickri Code AI

L'assistant peut appeler de vrais outils pendant la conversation (appel de fonctions Gemini). Les plugins s'activent dans le panneau « Plugins » de la page `/ai`.

| Plugin | Ce que l'IA peut faire | Accès |
| --- | --- | --- |
| GitHub | Lire et écrire dans les dépôts autorisés : branches, fichiers, pull requests et tickets | Tout compte connecté ; approbation explicite requise pour chaque écriture |
| Registre BCX | Lister les identifiants, calculer le prochain code libre, créer un identifiant | Tout compte connecté (règles RLS) |
| Web | Recherche Web via Tavily et lecture de pages publiques | Tout compte connecté ; `TAVILY_API_KEY` pour la recherche |
| Réseaux sociaux | Recherche de contenus publics indexés sur YouTube, Instagram, Facebook, TikTok, X et LinkedIn | Tout compte connecté ; `TAVILY_API_KEY` requis |
| Google Drive | Rechercher des fichiers et lire des documents texte/Google Docs, en lecture seule | OAuth serveur configuré ; accès limité aux fichiers autorisés au compte OAuth |
| Notion | Rechercher et lire des pages et blocs partagés avec l'intégration, en lecture seule | `NOTION_API_KEY` et partage explicite des pages avec l'intégration |

Garde-fous :

- Chaque action d'écriture s'arrête et attend un clic sur « Approuver » ; « Refuser » l'annule et l'IA en est informée.
- Le jeton GitHub/MCP reste exclusivement côté serveur. Tout utilisateur connecté peut lire et écrire uniquement dans les dépôts listés dans `GITHUB_ALLOWED_REPOSITORIES` (par défaut, le dépôt BCX). Chaque écriture exige une approbation explicite dans l'interface. Les dépôts restent limités à `GITHUB_ALLOWED_OWNERS`.
- Outils GitHub exclus volontairement : suppression de fichiers, fusion de pull requests, création ou fork de dépôts.
- Le plugin Web refuse les adresses privées et internes (protection SSRF) et limite la taille des réponses.
- Les résultats d'outils sont traités comme des données non fiables dans les instructions du modèle.
- Google Drive : active l'API Google Drive dans Google Cloud, configure OAuth 2.0 et obtiens un refresh token avec le scope `https://www.googleapis.com/auth/drive.readonly`. Renseigne les variables OAuth côté serveur ; ne partage jamais ces secrets côté client.
- Notion : crée une intégration interne, renseigne son token dans `NOTION_API_KEY`, puis partage chaque page/base nécessaire avec cette intégration. Les pages non partagées restent inaccessibles.
- Ces deux plugins sont en lecture seule. Les identifiants configurés côté serveur représentent des connexions d'intégration partagées, pas un flux OAuth individuel par utilisateur BCX.

Ajouter un plugin : créer `src/lib/agent/plugins/<nom>.ts` qui implémente l'interface `Plugin` (`src/lib/agent/types.ts`), puis l'ajouter à `src/lib/agent/plugins/index.ts`.

## Base de données

Applique les migrations dans l'ordre, uniquement sur le projet Supabase BCX :

1. `supabase/migrations/202610090001_initial_schema.sql`
2. `supabase/migrations/202610090002_auth_profiles_and_owner_access.sql`
3. `supabase/migrations/202610140001_revoke_trigger_function_execute.sql`

Les nouveaux comptes reçoivent le rôle `viewer`. Chaque utilisateur ne peut créer, modifier ou supprimer que ses propres identifiants. Les rôles élevés sont attribués par un administrateur.

Dans Supabase Auth, déclare l'URL du site et l'URL de redirection `https://<ton-domaine>/auth/callback`.

## Développement

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # types + lint + tests
npm run build      # build de production
```

Sans Supabase, l'application fonctionne en **mode local** : les identifiants et le projet du studio sont enregistrés dans le navigateur.

## Sécurité

- Clés IA et MCP uniquement côté serveur ; limitation de débit sur `/api/ai/code` (20 requêtes par minute et par IP) et `/api/ai/agent` (30), par instance.
- Plugins réservés aux comptes connectés ; GitHub en lecture et écriture pour les comptes connectés sur les dépôts autorisés, avec validation humaine avant chaque écriture (voir « Plugins »).
- En-têtes de sécurité (HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`).
- Aperçu du studio isolé dans une iframe `sandbox` sans accès à l'origine de l'application.
- Redirections d'authentification limitées aux chemins internes.
- Avant un lancement public : authentification obligatoire pour l'IA, quotas persistants (Upstash ou Supabase) et surveillance.

## Feuille de route

1. ~~Déploiement stable, authentification et base de données~~
2. ~~Registre connecté à PostgreSQL~~
3. ~~Éditeur professionnel (CodeMirror, aperçu multi-écrans, console)~~
4. Sessions cloud isolées : terminal, journaux, ports d'aperçu
5. Environnements Node.js et Python, puis langages compilés
6. Workers Flutter, Dart et Android (APK/AAB)
7. IA consciente du projet, synchronisation GitHub et déploiements
8. Revue de sécurité, quotas, surveillance, sauvegardes
