# BCX AI Engine — Ollama (phase 1)

Cette intégration permet à **BCX Chat** d'obtenir des réponses textuelles auprès d'un modèle Ollama auto-hébergé, sans clé Gemini/OpenAI. La mémoire déjà autorisée pour l'utilisateur est récupérée via `loadAuthorizedMemory` et incluse dans la consigne système.

## Serveur indépendant
1. Installer Ollama sur une machine/VM avec assez de RAM/VRAM.
2. Télécharger le modèle avec `ollama pull qwen3:8b`.
3. Vérifier localement `ollama run qwen3:8b` et `curl http://127.0.0.1:11434/api/tags`.
4. Placer Ollama derrière une **passerelle HTTPS authentifiée** (proxy inverse + authentification, idéalement réseau privé). Ne jamais exposer `0.0.0.0:11434` ouvert sur Internet.
5. Vérifier que le serveur Vercel BCX peut joindre la passerelle. Une adresse `localhost` sur Vercel ne désigne **pas** le serveur Ollama distant.

## Variables serveur BCX (Vercel)
```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=https://votre-passerelle-ollama.example
OLLAMA_MODEL=qwen3:8b
OLLAMA_API_TOKEN=votre_jeton_de_passerelle
```
La passerelle doit accepter l'en-tête `Authorization: Bearer <OLLAMA_API_TOKEN>` si ce jeton est configuré. Ne jamais préfixer le jeton par `NEXT_PUBLIC_`. Le modèle doit déjà être installé sur la machine distante.

## Périmètre et limites
- Le flux SSE du chat envoie des événements de phase et le résultat final, **pas encore un streaming token-par-token**.
- Cette première intégration traite des conversations **textuelles**. Les outils de l'agent (plugins/MCP), images, multimodal et recherche web restent à adapter pour Ollama.
- La mémoire persistante exige la configuration de Supabase BCX et ses migrations, indépendamment d'Ollama.
- `AI_PROVIDER=ollama` désactive le routage Gemini/OpenAI pour ce mode de chat ; ne pas activer en production avant un test d'intégration et de capacité.
- Ollama ne génère pas les clés `bcx_sk_` ; celles-ci relèvent du portail séparé.
- Les limites de requêtes en mémoire de Vercel sont **par instance**, pas globales : ajouter un rate-limit distribué et des quotas utilisateur avant une exposition publique intensive.

## Vérification avant bascule
1. `npm run check` et `npm run build`.
2. Tester une requête Ollama depuis l'hébergement BCX.
3. Envoyer un message via le chat BCX en mode `stream=true` et `stream=false`.
4. Vérifier les souvenirs de l'utilisateur authentifié et l'absence de fuite entre comptes.
5. Tester serveur inaccessible/timeout, secrets non exposés, expiration des sessions et limitation du trafic.
