# BCX Developer Portal — site indépendant

Ce sous-projet Next.js se déploie comme **un projet Vercel distinct** avec rootDirectory `apps/bcx-keys-portal`. Il ne fait pas partie des routes de BCX.

## Variables Vercel du portail

- `NEXT_PUBLIC_SUPABASE_URL` = URL de la **base BCX**
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = clé publique Supabase BCX
- `SUPABASE_SERVICE_ROLE_KEY` = clé de service Supabase BCX, **seulement côté serveur**

La migration `supabase/migrations/20261123090300_bcx_api_keys.sql` doit être appliquée sur cette même base BCX.

## Variables Vercel de l'application BCX

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = même projet BCX
- `SUPABASE_SERVICE_ROLE_KEY` = secret serveur pour vérifier les clés des appels externes.
- `BCX_API_KEY` = **facultatif** pour un client serveur BCX voulant appeler une API BCX via un jeton généré dans le portail. Ce n'est PAS un substitut à `GEMINI_API_KEY` ni un modèle IA.

## Endpoint de démonstration fonctionnel

```bash
curl -H "Authorization: Bearer bcx_sk_VOTRE_CLE" https://bickri-codex-system.vercel.app/api/bcx/v1/memories
```

Les clés ne donnent pour le moment que `memory:read`. La génération IA indépendante et les quotas distribués seront des extensions séparées.
