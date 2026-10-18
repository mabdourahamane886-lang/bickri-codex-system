# BCX — Reconstruction complète (desktop-first)

## Objectif
Faire évoluer BICKRI CODEX SYSTEM vers un IDE web de développement inspiré des environnements professionnels, prioritairement PC, avec adaptation mobile, sans présenter les fonctions non construites comme déjà disponibles.

## État de départ vérifié
- Next.js 15 App Router, React 19, TypeScript strict.
- CodeMirror 6 est déjà installé et utilisé par le Studio.
- Supabase Auth/PostgreSQL et un assistant IA avec plugins existent déjà.
- La route d'accueil délègue actuellement à l'interface Bickri Code AI.
- Le README indique explicitement que terminal cloud, conteneurs de build, compilation Flutter/Android et stockage cloud des fichiers ne sont pas implémentés.
- Dernier commit observé sur `main`: `aeaeca9b98886a9f024888355fceac5b91ea1424` (« Rebuild BCX unified AI chat »).

## Architecture cible

### Interface
- Shell IDE desktop: barre de commandes, explorateur de fichiers, éditeur multi-onglets, panneau terminal, aperçu et panneau IA redimensionnables.
- Command palette (Ctrl/Cmd+K), recherche globale et raccourcis clavier.
- Mobile: navigation compacte, éditeur plein écran, panneaux accessibles par onglets; pas de mise en page desktop simplement écrasée.
- Accessibilité: navigation clavier, focus visible, libellés accessibles et états de chargement/erreur.

### Gestion GitHub
- OAuth/GitHub App avec permissions minimales et dépôts explicitement autorisés.
- Clonage réel côté serveur dans un espace de travail utilisateur isolé; les API de contenu seules ne constituent pas un vrai clone Git.
- Opérations Git: status, diff, branches, commit, push et pull request.
- Toute écriture distante nécessite une approbation explicite et affiche le diff avant publication.
- Secrets GitHub conservés côté serveur; aucune clé secrète dans le navigateur.

### Exécution
- Ne pas exécuter de commandes shell dans une fonction serverless ordinaire.
- Worker séparé avec conteneurs éphémères, limites CPU/mémoire/temps, système de fichiers isolé, réseau sortant contrôlé et quotas.
- Terminal WebSocket authentifié; ports d'aperçu temporaires isolés.
- Commencer par Node.js/TypeScript et Python; ajouter ensuite les toolchains compilées, puis Flutter/Android sur des workers dédiés.

### Qualité et sécurité
- Conserver les migrations Supabase existantes et vérifier RLS avant toute évolution.
- Valider les entrées côté serveur, appliquer quotas persistants et journalisation sans secrets.
- Tests unitaires, tests de routes/API, vérification TypeScript, ESLint et build de production dans CI.
- Déploiement de prévisualisation avant production; ne jamais écraser `main` sans revue.

## Phases proposées
1. Inventaire complet des routes, composants, dépendances, variables et CI; établir un baseline reproductible.
2. Construire le shell IDE desktop et les vues mobile, en réutilisant CodeMirror et les fonctions existantes.
3. Unifier explorateur/éditeur/projets et stockage durable.
4. Implémenter le vrai flux GitHub (connexion, clonage, diff, branches, commit/push, PR) avec autorisations.
5. Ajouter l'exécution isolée et le terminal; tests d'isolation et limites de ressources.
6. Ajouter aperçu, diagnostics, assistant conscient du projet et flux de confirmation avant modification.
7. Vérifier CI, déploiement preview, tests fonctionnels PC/mobile, puis promouvoir en production après validation.

## Critères d'acceptation
- Les fonctions visibles sont réellement connectées à leur backend ou clairement marquées indisponibles.
- Un dépôt autorisé peut être cloné dans un workspace isolé, modifié, testé, puis poussé après confirmation.
- Les tests `npm run check` et `npm run build` passent en CI.
- L'interface est utilisable à largeur desktop et mobile; le clavier et les états d'erreur sont testés.
- Aucun secret serveur n'est renvoyé au client; un workspace ne peut pas lire celui d'un autre utilisateur.

## Limites du premier jalon
Ce document établit le plan technique. Il ne prétend pas que le terminal cloud, les conteneurs, le clonage Git complet ou le déploiement de production sont déjà réalisés. Ces fonctions doivent être implémentées et vérifiées dans les phases correspondantes.
