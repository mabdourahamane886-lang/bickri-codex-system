# Configuration Vercel : Supabase et Gemini

Projet Vercel : `bickri-codex-system` (équipe `bickri-service-agency`).
Projet Supabase BCX : `avgzbyvmsjjfgywtijno` (région eu-west-1).

## 1. Variables d'environnement

Dans **Vercel → bickri-codex-system → Settings → Environment Variables**, coche **Production**, **Preview** et **Development** pour chaque variable.

| Variable | Valeur | Type |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://avgzbyvmsjjfgywtijno.supabase.co` | Publique |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_DdDungDBgeVWS4yKRZJa1Q_dDhxV36a` | Publique (clé « publishable ») |
| `GEMINI_API_KEY` | Clé créée sur [Google AI Studio](https://aistudio.google.com/apikey) | **Secrète** : type « Sensitive » |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Optionnelle |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.6-flash` | Optionnelle |

Ne mets jamais la clé `service_role` de Supabase dans Vercel pour ce projet, et ne préfixe jamais `GEMINI_API_KEY` par `NEXT_PUBLIC_`.

Après l'ajout, redéploie : **Deployments → … → Redeploy**.

## 2. Base de données

Migrations 1 et 2 appliquées le 14/10/2026 sur `avgzbyvmsjjfgywtijno`. Ordre complet :

1. `supabase/migrations/202610090001_initial_schema.sql`
2. `supabase/migrations/202610090002_auth_profiles_and_owner_access.sql`
3. `supabase/migrations/202610140001_revoke_trigger_function_execute.sql`

## 3. Authentification Supabase

Dans **Supabase → Authentication → URL Configuration** :

- **Site URL** : le domaine de production Vercel (ex. `https://bickri-codex-system.vercel.app`).
- **Redirect URLs** : `https://<domaine>/auth/callback` et `https://*-bickri-service-agency.vercel.app/auth/callback` pour les aperçus.

## 4. Vérification

Ouvre `/settings` sur le site déployé : les lignes Supabase et Bickri Code AI doivent afficher « Configuré ». `/api/health` renvoie le même état en JSON (sans aucune valeur secrète).
