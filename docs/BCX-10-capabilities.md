# BCX — Capacités avancées de Bickri AI

Gemini reste le moteur de génération et de raisonnement. Les fonctionnalités décrites ici sont des modules applicatifs de Bickri AI, pas une copie du modèle propriétaire GPT-Astra.

## Modules ajoutés dans cette branche

| Module | Implémentation | Condition de mise en service |
|---|---|---|
| Mémoire personnelle | API GET/POST/PATCH/DELETE et interface `/ai/memories` | Migration SQL appliquée et session Supabase |
| Analyse Excel | Lecture XLSX, aperçu, statistiques de colonnes et analyse narrative Gemini | Session Supabase, classeur .xlsx jusqu'à 3 Mo |
| Création / export de documents | Interface `/ai/documents`, export DOCX, Markdown, TXT et HTML | Session Supabase |
| PDF | Impression depuis le navigateur avec « Enregistrer au format PDF » | Navigateur client |
| Exécution isolée | Proxy `/api/ai/execute`, interface `/ai/execute`, runner Docker séparé | Déployer le runner Linux et définir les deux secrets BCX |
| Observabilité | Journal de métriques serveur et tableau de bord `/admin/ai` | Migration SQL, `SUPABASE_SERVICE_ROLE_KEY`, rôle `app_metadata.role=admin` |

## Routes

- `GET/POST/PATCH/DELETE /api/ai/memories`
- `POST /api/ai/spreadsheets`
- `POST /api/ai/documents`
- `POST /api/ai/execute`
- `GET /api/ai/usage` (administrateur uniquement)
- `GET /api/ai/capabilities` (état public sans secrets)

## Déploiement Supabase

Appliquer dans Supabase SQL Editor :

`supabase/migrations/202610200001_bcx_ai_capabilities.sql`

Cette migration crée les tables mémoire, retours et télémétrie avec RLS. La mémoire reste isolée par `user_id`. Les événements de télémétrie sont écrits uniquement depuis le serveur avec la clé service role.

Variables serveur Vercel :
- `GEMINI_API_KEY` : moteur Gemini existant.
- `SUPABASE_SERVICE_ROLE_KEY` : télémétrie côté serveur uniquement. Ne jamais préfixer par `NEXT_PUBLIC_`.
- `BCX_SANDBOX_URL` : URL HTTPS du runner, terminant par `/execute`.
- `BCX_SANDBOX_TOKEN` : secret partagé de 32 caractères minimum.

## Déployer le runner isolé

Lire `sandbox/README.md`. Le runner doit être hébergé sur une machine Linux dédiée avec Docker. Il n'est pas exécuté dans la fonction Next.js/Vercel. Les conteneurs sont jetables, sans réseau, limités en CPU, mémoire, processus, durée et système de fichiers.

Langages actuellement pris en charge : Python, JavaScript et TypeScript. Le runner doit être construit et testé avant de configurer les variables Vercel. Tant que les deux variables sandbox ne sont pas définies, l'interface affiche explicitement que l'exécution n'est pas raccordée.

## Limites connues

- Le parseur Excel traite les classeurs XLSX standards, les huit premières feuilles et les 12 000 premières lignes par feuille. Il lit les valeurs mises en cache des formules, mais ne recalcule pas les formules Excel.
- Les fichiers Excel sont traités en mémoire et limités à 3 Mo pour rester compatibles avec les limites de fonctions serverless.
- L'export DOCX produit un document Word simple basé sur du texte, des titres et des listes. L'export PDF passe par la fonction d'impression du navigateur.
- Le tableau de bord n'affiche que les événements instrumentés après le déploiement et l'activation de la télémétrie.
- La page de statistiques exige le rôle `admin` dans `app_metadata`; ne pas utiliser `user_metadata` pour attribuer ce rôle.

## Vérifications avant production

1. Appliquer la migration SQL dans l'environnement cible.
2. Déployer le runner et tester ses limites réseau, mémoire, CPU et durée.
3. Configurer les variables d'environnement serveur sans exposer les secrets côté client.
4. Exécuter `npm run check` et `npm run build`.
5. Tester l'accès mémoire avec deux comptes différents pour confirmer l'isolation RLS.
6. Tester un fichier XLSX avec chaînes, nombres, cellules vides et formules.
7. Ouvrir un DOCX exporté dans Word ou LibreOffice.
8. Tester le tableau de bord avec un compte administrateur et un compte standard.
9. Vérifier le statut du déploiement et les routes en production avant d'annoncer que les modules sont actifs.
