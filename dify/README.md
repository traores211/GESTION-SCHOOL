# Assistant School ERP avec Dify

School ERP intègre deux assistants servis par [Dify](https://dify.ai) :

| Mode | Application Dify | Ce qu'il fait |
|---|---|---|
| **Chatbot** | Application « Chatbot » (ou Chatflow) | Répond aux questions d'utilisation de School ERP |
| **Agent** | Application « Agent » avec l'outil personnalisé *School ERP* | Consulte les données de l'établissement de l'utilisateur (effectifs, présence, élèves, impayés, emploi du temps) |

Le bouton **Assistant** apparaît en bas à droite de l'application pour le personnel (pas pour les parents).

## Fonctionnement

```
Navigateur ──POST /api/assistant/chat (JWT)──▶ Backend NestJS ──POST /v1/chat-messages (clé d'app)──▶ Dify
     ▲               flux SSE normalisé                │          inputs : user_name, user_role, school_name,
     └──────── token / thought / end / error ◀─────────┘                   today, context_token (agent)
                                                                                     │
Dify (agent) ──GET /api/assistant/tools/*?context_token=…──▶ Backend : données de l'école du jeton uniquement
```

- **Jeton de contexte** : à chaque message, le backend signe un jeton de 20 minutes contenant l'école et le rôle de l'utilisateur, et le transmet à Dify (variable `context_token`). L'agent le renvoie à chaque appel d'outil. Il ne peut donc lire que l'école de l'utilisateur, et seulement ce que son rôle autorise (les données financières sont réservées à la direction, au secrétariat et à la comptabilité). Un jeton de connexion n'est pas accepté par les outils.
- **Limites** : 20 messages par minute et par utilisateur ; 4 000 caractères par message.
- Code : `backend/src/assistant/` (client Dify, outils, jeton) et `frontend/src/components/assistant/AssistantPanel.tsx`.

## Mise en place sur Dify Cloud (ou Dify auto-hébergé)

### 1. Rendre les outils joignables par Dify (mode Agent)

Dify doit pouvoir appeler l'API de School ERP. En local, ouvrez un tunnel HTTPS vers le port 4000, par exemple :

```bash
cloudflared tunnel --url http://localhost:4000
# → https://xxxx.trycloudflare.com
```

puis, dans le `.env` à la racine :

```env
ASSISTANT_TOOLS_PUBLIC_URL=https://xxxx.trycloudflare.com/api
```

En production, mettez l'URL publique de l'API (`https://api.mon-ecole.ci/api`).

### 2. Créer l'application Chatbot

1. Dify → **Studio** → **Créer une application** → **Chatbot** (type *Basic*), nom « School ERP — Assistant ».
2. **Variables** (*Orchestrate → Variables*) : créez les variables texte `user_name`, `user_role`, `school_name`, `school_city`, `today` (facultatives).
3. **Instructions** : collez le contenu de [`prompts/chatbot.md`](prompts/chatbot.md).
4. Choisissez le modèle (Claude, GPT…), **Publier**.
5. **Accès API** → **Clé API** → créez une clé (`app-…`).

### 3. Créer l'application Agent

1. **Outils** → **Personnalisé** → **Créer un outil personnalisé** → **Importer depuis une URL** :
   `https://xxxx.trycloudflare.com/api/assistant/tools/openapi.json` (ou collez le schéma).
   Authentification : **Aucune** (la sécurité passe par `context_token`). Nommez l'outil « School ERP ».
2. **Studio** → **Créer une application** → **Agent**, nom « School ERP — Agent ».
3. **Variables** : les mêmes que le chatbot **plus** `context_token` (texte, longueur max 2 000).
4. **Instructions** : collez [`prompts/agent.md`](prompts/agent.md).
5. **Outils** : ajoutez les 6 outils de « School ERP ». Un modèle qui gère l'appel d'outils (*function calling*) est recommandé.
6. **Publier**, puis **Accès API** → créez une clé (`app-…`).

### 4. Configurer School ERP

Dans le `.env` à la racine :

```env
DIFY_API_URL=https://api.dify.ai/v1          # ou http(s)://votre-dify/v1 si auto-hébergé
DIFY_CHATBOT_API_KEY=app-xxxxxxxxxxxxxxxx
DIFY_AGENT_API_KEY=app-yyyyyyyyyyyyyyyy
ASSISTANT_TOOLS_PUBLIC_URL=https://xxxx.trycloudflare.com/api
```

puis recréez le backend : `docker compose up -d backend`. Vérifiez : `GET /api/assistant/status` doit renvoyer `chatbot: true` et `agent: true`.

## Tester sans compte Dify

`backend/test/mock-dify.js` imite l'API Dify (même format de flux) et, en mode agent, appelle réellement les outils avec le jeton reçu :

```bash
docker cp backend/test/mock-dify.js school-backend:/app/test/mock-dify.js
docker compose exec -d backend node test/mock-dify.js
# .env : DIFY_API_URL=http://localhost:5001/v1, DIFY_CHATBOT_API_KEY=app-mock-chatbot, DIFY_AGENT_API_KEY=app-mock-agent
docker compose up -d backend    # puis relancer le mock (le conteneur a redémarré)
```

## Pourquoi pas Dify dans ce docker-compose ?

L'auto-hébergement de Dify ajoute une dizaine de conteneurs (API, worker, web, PostgreSQL, Redis, base vectorielle, sandbox, serveur de plugins, nginx) : il faut compter au moins 4 Go de mémoire et une dizaine de Go de disque en plus. Il se déploie à part avec le `docker-compose` officiel de Dify ; School ERP s'y branche par `DIFY_API_URL`.
