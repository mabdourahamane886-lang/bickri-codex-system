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

Non implémenté à ce jour : terminal cloud, conteneurs de build, compilation Flutter/Android, stockage cloud des fichiers, écriture GitHub (commits, branches).

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
- Gemini (Google AI Studio) côté serveur, avec modèle de repli
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
| `GEMINI_API_KEY` | Oui pour l'IA | Clé serveur Google AI Studio |
| `GEMINI_MODEL` | Non | Modèle principal |
| `GEMINI_FALLBACK_MODEL` | Non | Modèle de repli |
| `GITHUB_MCP_URL` | Non | Serveur GitHub MCP distant (Streamable HTTP, HTTPS) |
| `GITHUB_MCP_BEARER_TOKEN` | Non | Jeton du serveur MCP |

Ne préfixe jamais une clé secrète par `NEXT_PUBLIC_` et n'expose jamais une clé `service_role`. La page `/settings` indique ce qui est configuré sans jamais afficher les valeurs.

## Base de données

Applique les migrations dans l'ordre, uniquement sur le projet Supabase BCX :

1. `supabase/migrations/202610090001_initial_schema.sql`
2. `supabase/migrations/202610090002_auth_profiles_and_owner_access.sql`

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

- Clés IA et MCP uniquement côté serveur ; limitation de débit sur `/api/ai/code` (20 requêtes par minute et par IP, par instance).
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
