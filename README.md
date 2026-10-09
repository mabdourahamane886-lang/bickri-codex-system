# BICKRI CODEX SYSTEM (BCX)

Registre central des identifiants technologiques BICKRI CODEX.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel (déploiement à configurer)

## Installation
1. `npm install`
2. Copier `.env.example` vers `.env.local`
3. Renseigner l’URL Supabase et la clé publishable.
4. `npm run dev`

## Base de données
La migration initiale est dans `supabase/migrations/202610090001_initial_schema.sql`. Vérifiez le projet Supabase cible avant de l'appliquer.

## Sécurité
Ne jamais exposer la clé `service_role` dans le navigateur. Les identifiants sont uniques en base de données; la version logicielle reste un champ séparé.
