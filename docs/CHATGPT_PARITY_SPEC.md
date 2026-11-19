# Cahier des charges — Parité fonctionnelle ChatGPT pour BCX

Branche de travail : `feat/chatgpt-workspace-parity`  
Dépôt : `mabdourahamane886-lang/bickri-codex-system`  
Référence UX : captures d'écran ChatGPT fournies dans la conversation.

## Objectif

Faire évoluer BICKRI CODEX SYSTEM vers un espace conversationnel et de travail complet, inspiré des fonctionnalités visibles dans ChatGPT, sans copier son identité visuelle ni supprimer les capacités propres à BCX (assistant de programmation, Studio, IDE Cloud, plugins, registre, mémoire et intégrations).

## Règles non négociables

- Ne pas remplacer ni réécrire globalement l'application existante.
- Ne pas supprimer les conversations, données Supabase, mémoires, plugins ou outils existants.
- Les profils visuels `Luna`, `Terra` et `Sol` sont retirés de l'interface du chat. Leur logique ne doit pas être exposée comme sélecteur dans l'en-tête.
- Les modes internes de traitement IA restent découplés de l'identité/profil de l'assistant. Leur futur emplacement sera défini ultérieurement par le propriétaire du projet.
- Toute action affichée doit être fonctionnelle, accessible au clavier et adaptée au mobile.
- Les actions d'écriture via plugins doivent conserver la confirmation explicite et les contrôles d'autorisation existants.
- Les migrations de base doivent être additives, avec RLS, et ne doivent pas supprimer les données existantes.

## Fonctionnalités demandées

### Navigation et espace personnel
1. **Images** — espace de génération, consultation et réutilisation des images, avec historique et états d'erreur explicites.
2. **Bibliothèque** — fichiers et documents de l'utilisateur, recherche, aperçu, import/export, suppression avec confirmation et permissions par utilisateur.
3. **Personnaliser** — préférences de l'assistant (langue, ton, format de réponse, consignes), avec sauvegarde et réinitialisation.
4. **Projets** — espaces de travail nommés regroupant conversations, fichiers, instructions et contexte de projet.
5. **Télécommande** — contrôle d'une session/appareil distant uniquement après appairage authentifié, révocation de session et confirmation des actions sensibles. Ne jamais présenter une télécommande non connectée comme active.
6. **Explorer** — catalogue des outils, plugins et capacités disponibles, avec disponibilité/configuration réelle.
7. **Éléments épinglés** — conversations et ressources épinglées, désépinglage et persistance utilisateur.
8. **Historique des chats** — recherche, regroupement chronologique, reprise, renommage, épinglage et suppression contrôlée.

### Composer et pièces jointes
9. **Appareil photo** — capture depuis le téléphone avec permission du navigateur.
10. **Photos** — sélection multiple depuis la galerie, aperçu et retrait avant envoi.
11. **Fichiers** — import avec validation du type et de la taille, extraction contrôlée et transmission à l'IA.
12. **Plugins** — ouverture du catalogue, activation par conversation et consentement avant toute action ayant un effet externe.
13. **Analyser plus en profondeur** — action explicite qui active le traitement approfondi et la recherche configurée, avec indicateur d'état. L'interface ne doit jamais prétendre afficher le raisonnement privé du modèle.

## État de la première passe sur cette branche

- [x] Retrait du sélecteur de profils `AUTO / LUNA / TERRA / SOL` de l'en-tête du chat.
- [x] Retrait du sélecteur de modes de réflexion de la zone actuelle du composer, en attendant le nouvel emplacement demandé.
- [x] Ajout d'une entrée Appareil photo (capture mobile) au menu d'ajout.
- [x] Entrée Photos / Galerie conservée.
- [x] Ajout d'une action « Analyser plus en profondeur » qui active le mode interne approfondi et la recherche configurée.
- [x] Import de fichiers existant conservé.
- [x] Accès aux plugins, à la mémoire, aux documents, au tableur, à l'exécution de code et au cloud conservé.

## Fonctionnalités à auditer/implémenter dans les prochaines passes

- [ ] Pages et persistance de la Bibliothèque.
- [ ] Préférences « Personnaliser ».
- [ ] Gestion de projets et association des conversations/fichiers.
- [ ] Télécommande : définir le protocole, l'appareil cible et les limites de sécurité avant toute implémentation.
- [ ] Explorer : catalogue unifié des outils et capacités.
- [ ] Épinglage des conversations et ressources.
- [ ] Espace Images dédié et historique des générations.
- [ ] Historique conversationnel persistant côté compte (le chat actuel utilise notamment le stockage local/session).
- [ ] Tests unitaires, tests d'intégration et vérification responsive pour chaque module.

## Critères d'acceptation

- Toutes les fonctions de navigation mènent à une page réelle, pas à une redirection vide ni à un bouton décoratif.
- Les données privées sont isolées par utilisateur avec RLS côté Supabase.
- Les fonctions restent utilisables sur écran mobile et desktop.
- Les pièces jointes sont validées côté serveur; les secrets restent côté serveur.
- Les actions de plugins avec effets externes demandent une approbation.
- `npm run check` et `npm run build` passent avant fusion.
- La branche `main` ne reçoit pas de modification directe : revue via pull request.

## Vérifications à exécuter

```bash
npm ci
npm run check
npm run build
```

Le présent document est un cahier des charges et un suivi d'avancement. Les cases non cochées ne doivent pas être présentées comme déjà livrées.
