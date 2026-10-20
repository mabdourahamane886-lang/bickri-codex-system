# Recherche Google/Web et métadonnées BCX

## Recherche web côté serveur

BCX prend en charge deux fournisseurs de recherche. Les clés restent exclusivement côté serveur et ne doivent jamais être préfixées par `NEXT_PUBLIC_`.

### Option A — Google Programmable Search

Dans Vercel → Project → Settings → Environment Variables, ajoute :

- `GOOGLE_SEARCH_API_KEY` : clé API Google autorisée à utiliser Custom Search JSON API.
- `GOOGLE_SEARCH_ENGINE_ID` : identifiant du moteur Programmable Search Engine (cx).

Active l'API Custom Search JSON dans le projet Google Cloud associé et configure le moteur pour rechercher sur le Web.

### Option B — Recherche Web Tavily

Ajoute :

- `TAVILY_API_KEY` : clé serveur obtenue depuis le tableau de bord Tavily.

Google est essayé en premier lorsqu'il est configuré. Si Google ne renvoie aucun résultat exploitable ou est indisponible, BCX essaie Tavily si sa clé est configurée. Si aucun fournisseur n'est configuré, l'assistant continue à fonctionner sans recherche web externe.

La recherche est lancée automatiquement pour les demandes qui semblent nécessiter des informations récentes ou une recherche explicite. Les résultats sont transmis au modèle comme contenu non fiable; l'assistant est invité à citer les URL pertinentes. La route renvoie également `sources` et l'état `webSearch` pour permettre à l'interface d'afficher des liens de sources.

Après avoir ajouté ou modifié les variables, redéploie le projet Vercel.

## Métadonnées SEO et partage

Le layout Next.js définit les métadonnées globales : titre, description, mots-clés, créateur/éditeur, URL canonique, robots, Open Graph et Twitter Card. Ces métadonnées améliorent l'indexation et les aperçus de partage, mais ne garantissent pas un classement Google. Pour une meilleure carte sociale, ajoute une vraie image Open Graph publique au projet et référence-la dans `openGraph.images`.

## Sécurité et fonctionnement

- Aucune clé de recherche n'est envoyée au navigateur.
- Les requêtes externes ont des délais d'expiration et les résultats sont limités.
- Les résultats web peuvent contenir des erreurs ou du contenu malveillant; ils ne sont pas des instructions.
- L'état des fournisseurs est exposé sans révéler les clés via `GET /api/ai/capabilities`.
- Sans les variables de fournisseur, le code est intégré mais la recherche externe ne peut pas fonctionner en production.
