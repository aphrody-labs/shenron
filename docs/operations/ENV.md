# Variables d'environnement — référence canonique

Document de référence unique pour les variables lues par le bot, le site et le pipeline.
Les autres documents renvoient ici au lieu de recopier les listes. Les résolveurs cités sont
la source de vérité : en cas d'écart, le code fait foi.

Règles :

- **Aucune valeur de production n'est écrite dans ce dépôt.** Les adresses, ports et secrets
  de production viennent de l'environnement fourni par `aphrody-infra`
  (catalogue de services et fichiers d'environnement de l'opérateur).
- Les défauts codés dans `@shenron/config` ne servent qu'à garder un processus utilisable sans
  environnement (poste de dev, tests). C'est le seul endroit autorisé à les écrire.
- Les `.env` ne sont jamais affichés ni commités. Poste de développement : [`DEV-LOCAL.md`](DEV-LOCAL.md).
- Nom canonique d'abord ; les noms historiques restent acceptés en lecture. Quand plusieurs
  noms sont posés, la première valeur non vide dans l'ordre de lecture l'emporte.

## Origines publiques — `@shenron/config/public-urls`

Résolveurs `resolveSiteUrl`, `resolveApiUrl`, `resolveAssetsUrl`, table `PUBLIC_URL_ENV`.
Le miroir `NEXT_PUBLIC_*` est lu en premier : c'est la valeur que Next inscrit dans les bundles
client, serveur et client doivent donc résoudre la même origine.

| Origine      | Canonique                   | Ordre de lecture                                                                             | Repli                     |
| ------------ | --------------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| site         | `SHENRON_PUBLIC_SITE_URL`   | `NEXT_PUBLIC_SITE_URL`, `SHENRON_PUBLIC_SITE_URL`, `SITE_PUBLIC_URL`, `BETTER_AUTH_URL`      | origine publique du site  |
| API du bot   | `SHENRON_PUBLIC_API_URL`    | `NEXT_PUBLIC_SHENRON_API_URL`, `SHENRON_PUBLIC_API_URL`, `API_PUBLIC_URL`, `SHENRON_API_URL` | origine publique de l'API |
| assets / CDN | `SHENRON_PUBLIC_ASSETS_URL` | `NEXT_PUBLIC_SHENRON_ASSETS_URL`, `SHENRON_PUBLIC_ASSETS_URL`                                | origine de l'API          |

`ownImageRemotePatterns(env)` dérive de ces mêmes origines les `images.remotePatterns` de Next
(assets, CDN miroir, médias Discord) ; `assetMirrorUrl` bascule une URL d'asset entre le CDN et
l'API, qui servent le même arbre `/assets/**`.

## Services internes — `@shenron/config/services`

Résolveurs `resolveRedisUrl`, `resolveSiteInternalUrl`, `resolveBotApiInternalUrl`,
`resolveBotApiServerUrl`, `resolveRelectureOcrUrl`, table
`INTERNAL_SERVICE_ENV`. Les défauts sont des adresses de boucle locale pour le dev ; en
production, l'environnement les fournit.

| Service                              | Ordre de lecture                                      |
| ------------------------------------ | ----------------------------------------------------- |
| Redis / Valkey                       | `REDIS_URL`, `VALKEY_URL`                             |
| Site interne (appels bot → site)     | `SITE_INTERNAL_URL`                                   |
| API du bot (bind et appels internes) | `API_HOST` + `API_PORT`                               |
| API du bot (appels serveur du site)  | `BOT_INTERNAL_URL`, sinon l'origine publique de l'API |
| Sidecar de relecture OCR             | `RELECTURE_OCR_URL`                                   |

Le rate limit d'authentification du site (`apps/site/src/lib/auth-rate-limit.ts`) utilise
`REDIS_URL` s'il est posé et se replie sur un stockage en mémoire sinon ; il n'a pas d'URL par
défaut.

## Alias de secrets et de chemins — `@shenron/config/env`, `@shenron/config/paths`

`ENV_ALIASES` : paires qui doivent porter la même valeur quand les deux sont posées
(`checkAlias` signale l'écart en nommant les variables, jamais les valeurs).

| Rôle                          | Canonique             | Historique        |
| ----------------------------- | --------------------- | ----------------- |
| Jeton admin de l'API          | `SHENRON_ADMIN_TOKEN` | `API_ADMIN_TOKEN` |
| Secret d'utilisateur agissant | `SHENRON_USER_SECRET` | `API_USER_SECRET` |
| Boîtes A2A `.coord`           | `A2A_COORD_DIR`       | `COORD_DIR`       |
| Jeu gold RAG                  | `RAG_GOLD_PATH`       | `RAG_GOLD`        |

`DATA_PATH_ENV` (chemins de données inscriptibles, défaut relatif au dépôt) : `RAG_GOLD_PATH`,
`SHENRON_ADMIN_DOCS_DIR`, `A2A_COORD_DIR`, `DATABOOKS_FREEZE_FILE`, `RAG_LEXIQUE`,
`SHENRON_PRIVATE_DOWNLOADS_DIR`. En production, un chemin encore issu du défaut est signalé une
fois par processus.

- `SHENRON_PRIVATE_DOWNLOADS_DIR` (défaut `/srv/shenron/shared/private-downloads`, hors release) :
  fichiers réservés aux administrateurs, servis par `GET /api/private-downloads` (index) et
  `GET /api/private-downloads/<nom>` (reprise par `Range`). Seuls les fichiers listés dans le
  `SHA256SUMS` du dossier sont servis ; garde `hasValidApiToken` (jeton admin ou IP de
  `SHENRON_ADMIN_IPS`), sinon `404`. `.md`, `.txt` et `.json` sont servis en ligne.
- A2A : sans `APHRODY_A2A_URL` (cas de la production depuis le retrait du service Aphrody du
  2026-09-25), `/api/a2a` est servi par le hub Shenron du site (A2A 1.0 `SendMessage`, `GetTask`,
  `ListTasks` et dialecte historique). Stockage durable : `APHRODY_A2A_COORD_API` s'il est posé,
  sinon `SHENRON_A2A_STORE_DIR`, sinon `<A2A_COORD_DIR>/shenron-dragonball` en production. Les
  écritures exigent `SHENRON_A2A_TOKEN`, un jeton admin ou une IP d'administration. Le bot relaie
  carte et JSON-RPC au site et diffuse ses événements publics sur `/api/a2a/events`.

## Base de données — `@shenron/db`

| Variable                  | Rôle                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | PostgreSQL `shenron_site`, schéma `postgres://` ou `postgresql://` obligatoire (`resolveDatabaseUrl`).              |
| `SITE_BUILD_DATABASE_URL` | Base de lecture d'un build du site qui en a besoin ; le build public de `shenron-server` compile le site sans base. |
| `DATABASE_PATH`           | Fichier SQLite du bot (runtime + réplica wiki).                                                                     |

## Authentification — `@shenron/auth`

| Variable                                                                                  | Rôle                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                                                      | Secret Better Auth, lu par `resolveBetterAuthSecret` ; repli `SESSION_SECRET`. Obligatoire en production, une valeur trop courte est refusée.                                                                                                                                                                                                                                           |
| `BETTER_AUTH_URL`                                                                         | Base URL Better Auth de l'app (aussi dernier repli de l'origine du site).                                                                                                                                                                                                                                                                                                               |
| `SHENRON_ADMIN_TOKEN`                                                                     | Jeton d'administration maître. Utilisable via le formulaire `/admin-access` (POST, jamais dans une URL), `Authorization: Bearer <token>`, `x-admin-token` ou le cookie HMAC signé `dbfr_admin` (30 jours après connexion durable). `aphrody shenron auth url` n'affiche que l'URL du formulaire.                                                                                        |
| `SHENRON_ADMIN_IPS`                                                                       | Postes d'administration (adresses ou CIDR, séparés par virgules) : staff sans session ni jeton pour `/admin`, la session (`ADMIN_IP_ACTOR`) et les routes « admin ou jeton » (desktop, CLI, scripts). Adresse lue dans `X-Real-IP` posé par nginx (`@/lib/admin-ip`). Tenue à jour par `scripts/ops/admin-access.ts`, avec `SHENRON_MCP_ALLOWED_IPS` du MCP. Vide : aucun accès par IP. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `OAUTH_ALLOWED_USERS` | OAuth Discord.                                                                                                                                                                                                                                                                                                                                                                          |
| `AgentKey` (table PG)                                                                     | Jetons d'agents autonomes (`dbfr_agent_...`) avec portées explicites (`moderate`, `write:articles`, etc.) acceptés par le proxy et `getCurrentUser()`.                                                                                                                                                                                                                                  |

## Serveur MCP — `apps/site/src/lib/ai-access.ts` et `crates/shenron-mcp`

`shenron-mcp --http <adresse> --public` sert deux paliers sur `/mcp` : les appelants anonymes ne voient et n'appellent que les outils en lecture seule ; un appelant **élevé** reçoit tous les outils (lecture, écriture, admin). Est élevé : un `Authorization: Bearer <jeton>` accepté, ou une IP cliente de `SHENRON_MCP_ALLOWED_IPS`. Un jeton présent mais inconnu donne `401` avec `WWW-Authenticate: Bearer` (jamais de repli silencieux en anonyme, même depuis une IP autorisée). Le transport est sans session (`application/json`, aucun `mcp-session-id`) : chaque requête est classée sur ses propres identifiants, un redémarrage (release) reste invisible aux clients et un `mcp-session-id` périmé est ignoré ; un `Accept` incomplet est complété. La carte `/.well-known/mcp.json` annonce `authentication: { read: "none", write: "bearer token or allow-listed IP" }`, les outils publics (`tools`) et les outils élevés (`elevatedTools`, `elevatedToolCount`).

| Variable                                                     | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHENRON_MCP_URL`                                            | Origine HTTP(S) du serveur `shenron-mcp --http <adresse> --public`, lue côté serveur seulement (validée par `apps/site/src/lib/env.ts`). Le site relaie `/mcp` vers `<origine>/mcp` en transmettant `Authorization`, `X-Forwarded-For` et `X-Real-IP`. **Aucun défaut** : sans valeur (ou avec une URL invalide), `/mcp` répond 503 et ni `llms.txt` ni `/.well-known/mcp.json` n'annoncent le serveur.                    |
| `SHENRON_HOST_URL`                                           | Origine de l'hôte Bun (`shenron-server`), optionnelle (`@shenron/config/public-urls` `resolveHostUrl`). Site : si posée, `/api/auth/*` lui est relayé et la session se lit chez lui (cookie ou Bearer transmis) ; absente, le site garde son Better Auth (aucun changement). Bureau : `agent-home` valide le jeton Bearer sur `<origine>/api/auth/get-session`, à défaut sur le site public.                               |
| `SHENRON_AUTH_ALLOWED_HOSTS`, `SHENRON_AUTH_TRUSTED_ORIGINS` | Listes CSV ajoutées aux hôtes et origines de confiance du Better Auth de l'hôte Bun (`packages/api/src/host/auth.ts`), par exemple la boucle locale d'un profil bureau. Le groupe auth de l'hôte exige `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (et `BETTER_AUTH_SECRET` en production) ; sinon il reste désactivé avec sa raison.                                                                     |
| `SHENRON_MCP_TOKENS`                                         | Jetons porteurs acceptés (liste séparée par des virgules, 16 octets minimum chacun, comparaison à durée constante). Process `shenron-mcp`.                                                                                                                                                                                                                                                                                 |
| `SHENRON_API_ADMIN_TOKEN`, `DBFR_TOKEN`                      | Acceptés aussi comme jetons porteurs d'élévation quand ils sont posés (16 octets minimum). Ce sont également les jetons que les outils d'écriture envoient aux API : voir ci-dessous.                                                                                                                                                                                                                                      |
| `SHENRON_MCP_ALLOWED_IPS`                                    | IP ou CIDR (v4 et v6, séparés par des virgules) élevés sans jeton. Entrée invalide ignorée (journalisée). Défaut : aucune.                                                                                                                                                                                                                                                                                                 |
| `SHENRON_MCP_TRUSTED_PROXIES`                                | IP/CIDR des proxys dont les en-têtes `X-Forwarded-For` (entrée la plus à droite non fiable) puis `X-Real-IP` sont crus. Défaut : `127.0.0.0/8, ::1`. Un pair non listé ne peut pas usurper une IP autorisée : ses en-têtes sont ignorés. Le proxy frontal (nginx) doit **écraser** ces en-têtes, pas relayer ceux du client. Sans en-tête, l'IP cliente est celle du proxy : n'autorisez pas `127.0.0.1` derrière le site. |
| `SHENRON_MCP_ALLOWED_HOSTS`                                  | En-têtes `Host` acceptés (anti DNS rebinding). Défaut : loopback, `dragonballfr.com`, `mcp.dragonballfr.com`.                                                                                                                                                                                                                                                                                                              |
| `SHENRON_MCP_LOG`                                            | Filtre de journal (`tracing`) du processus, sur stderr. Défaut : `warn`.                                                                                                                                                                                                                                                                                                                                                   |

### Jetons des outils d'écriture (environnement du processus `shenron-mcp`)

Quand le serveur est élevé, les outils appellent les API avec les variables du processus ; le palier anonyme ne les utilise jamais (les outils concernés ne lui sont pas exposés, et `dbfr_*` n'attache plus de jeton à une lecture anonyme).

| Variable                                                                                         | Utilisée par                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DBFR_TOKEN` (repli `SHENRON_ADMIN_TOKEN`)                                                       | `dbfr_databooks` (`include_hidden`), `dbfr_deposit`                                                                                                                                                                     |
| `SHENRON_DATABOOKS_API_TOKEN` (repli `DATABOOKS_API_TOKEN`, `SHENRON_ADMIN_TOKEN`, `DBFR_TOKEN`) | `dragonball.admin_databooks_deposit`, `databook_create/update/delete/page_edit/anomalies/ocr_review`, `site_config_get/put`, `reports_list/update` (jeton porteur du site, `apps/site/src/lib/api-token.ts`)            |
| `SHENRON_API_ADMIN_TOKEN`                                                                        | `dragonball.admin_bot_*`, `admin_services`, `admin_service_action` (API bot)                                                                                                                                            |
| `SHENRON_AGENT_API_KEY`                                                                          | `dragonball.agent_*` (`/api/agent/v1/*`) : clé `dbfr_agent_...` créée dans `/admin/agents`, ses portées (`read`, `write:articles`, `publish:articles`, `comment`, `moderate`, `contribute`) décident ce qui est permis. |
| `SHENRON_API_URL`, `SHENRON_SITE_API_URL`, `SHENRON_SITE_URL`, `DBFR_BASE_URL`                   | Cibles des appels (défauts : bot et site publics).                                                                                                                                                                      |

## IA Aphrody — `@shenron/pipeline/ai/config` (contrat `aphrody-infra`)

Les noms suivent le contrat IA local v1 d'`aphrody-infra` :
fichier `local-ai.json` de la configuration d'`aphrody-infra`
(noms canoniques, alias hérités, forme d'URL de chaque alias, index `shenron-rag` et valeurs
de la cible `vps`). Le résolveur unique est `@shenron/pipeline/ai/config` (table `AI_ENV`) : bot,
site, façades `@shenron/pipeline/aphrody`, pipeline et scripts passent tous par lui. Il lit le nom
canonique d'abord, puis chaque alias dans l'ordre du contrat ; un alias de forme `origin`
reçoit `/v1`, un alias de forme `endpoint` perd son chemin d'opération. **Aucune adresse par
défaut** : sans valeur, la capacité est désactivée, et un appel explicite (client de calcul,
scripts) échoue avec une erreur qui nomme les variables, jamais leurs valeurs. Toutes les URL
doivent être en HTTP sur une adresse de boucle locale. Le test
`packages/pipeline/test/ai/config.test.ts` vérifie la parité avec le contrat quand le dépôt voisin
`aphrody-infra` est présent.

| Rôle                                                | Canonique                                                  | Alias lus ensuite (forme)                                                                                                     | Défaut                         |
| --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Origine d'`aphrody-ai-http` (RAG, LLM, OCR, vision) | `APHRODY_AI_HTTP_URL`                                      | `APHRODY_SHENRON_API_URL` (origin)                                                                                            | aucun                          |
| Jeton bearer d'`aphrody-ai-http`                    | `APHRODY_AI_HTTP_TOKEN`                                    | `APHRODY_SHENRON_API_TOKEN`                                                                                                   | aucun                          |
| Modèle de chat envoyé à `/llm/chat`                 | `APHRODY_AI_CHAT_MODEL`                                    | `APHRODY_LLM_MODEL`, `APHRODY_SHENRON_LLM_MODEL`                                                                              | `gemini-web/flash`             |
| Modèle de relecture visuelle (`/vision/structured`) | `APHRODY_AI_VISION_MODEL`                                  | `APHRODY_SHENRON_VISION_MODEL`                                                                                                | `gemini-web/flash`             |
| Embedder E5 direct (`/v1/embeddings`)               | `APHRODY_AI_EMBED_BASE_URL` (base)                         | `APHRODY_SHENRON_EMBED_BASE_URL` (base), `EMBED_URL` (origin), `APHRODY_RAG_EMBED_ENDPOINT` (endpoint)                        | aucun (recherche lexicale)     |
| Modèle d'embedding                                  | `APHRODY_AI_EMBED_MODEL`                                   | `APHRODY_SHENRON_EMBED_MODEL`, `APHRODY_RAG_EMBED_MODEL`                                                                      | `Xenova/multilingual-e5-small` |
| Dimensions d'embedding                              | `APHRODY_AI_EMBED_DIMENSIONS`                              | `APHRODY_RAG_EMBED_DIM`                                                                                                       | `384`                          |
| Reranker (optionnel)                                | `APHRODY_AI_RERANK_BASE_URL` (base, dialecte llama-server) | `RERANK_URL` (endpoint, dialecte sidecar Shenron `{query, passages}`), `APHRODY_RAG_RERANK_ENDPOINT` (endpoint, llama-server) | désactivé                      |
| Modèle du reranker                                  | `APHRODY_AI_RERANK_MODEL`                                  | `APHRODY_RAG_RERANK_MODEL`                                                                                                    | aucun                          |

**Espace d'embedding (règle `never-mix-spaces`).** Le modèle et la dimension configurés sont
comparés à l'index au démarrage du bot (`assertRagEmbeddingSpace`) et avant toute écriture de
vecteurs par les scripts (`requireScriptEmbeddingSpace`) : l'index `shenron-rag` du contrat
(`Xenova/multilingual-e5-small`, q8, 384 dimensions) en mode `RAG_BACKEND=aphrody`, la ligne
`rag_meta` de l'index SQLite sinon. Un écart est une erreur fatale : le bot refuse de démarrer,
le script s'arrête avant d'écrire. Changer d'espace impose une réindexation.

**Serveur de chat direct (Gemma 4 E2B du vps).** `APHRODY_AI_CHAT_BASE_URL` (forme `base`,
alias lus ensuite : `APHRODY_SHENRON_LLM_BASE_URL`, `APHRODY_OSS_BASE_URL`, puis
`APHRODY_LOCAL_MODEL_URL` de forme `origin`) désigne un serveur OpenAI-compatible
(`POST <base>/chat/completions`) ; résolu par `resolveDirectChat`, appelé par
`createOpenAiChat` (`@shenron/pipeline/aphrody/compute`). Déclaré, il sert la génération du
chat du site (`/api/chat`, `chatAphrodyRag`) et du bot (`APHRODY_SHENRON_INFERENCE=http`) à la
place de `/llm/chat` ; la recherche RAG reste sur `aphrody-ai-http`. Aucune adresse par défaut ;
le modèle envoyé est `APHRODY_AI_CHAT_MODEL` (ou ses alias), sinon `gemma4-e2b`
(`DIRECT_CHAT_MODEL_ID` de `@shenron/config/services`). En production, l'unité
`aphrody-llama-gemma4` d'`aphrody-infra` (llama.cpp, Gemma 4 E2B IT Q4_K_M préchargé et
verrouillé en RAM, alias `gemma4-e2b`) écoute `127.0.0.1:8798` sur le vps, sans exposition
nginx, avec un `GET /health` :

```sh
APHRODY_AI_CHAT_BASE_URL=http://127.0.0.1:8798/v1
APHRODY_AI_CHAT_MODEL=gemma4-e2b
```

Non lu par Shenron : `APHRODY_AI_VISION_BASE_URL` (la vision passe par `aphrody-ai-http`,
jamais directement par un serveur de modèle).

Autres variables Aphrody :

| Variable                                              | Rôle                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `RAG_BACKEND`                                         | `aphrody` (égalité exacte) : recherche, contexte et statistiques RAG par `aphrody-ai-http`. |
| `EMBED_TIMEOUT_MS`, `RERANK_TIMEOUT_MS`, `RAG_RERANK` | Délai du chemin chaud d'embedding, délai du reranker, `RAG_RERANK=0` coupe le rerank.       |
| `APHRODY_WEB_API_URL`, `APHRODY_BXC_API_TOKEN`        | API web/crawl d'Aphrody.                                                                    |
| `APHRODY_BIN`                                         | Chemin du CLI `aphrody` quand il n'est pas sur le `PATH`.                                   |

## Modèles de chat locaux (Shenron Studio) — `@shenron/config/chat-model`, `apps/server/src/chat-model.ts`

Dans le profil `desktop`, sans URL de chat déclarée (`APHRODY_AI_CHAT_BASE_URL`,
`APHRODY_SHENRON_LLM_BASE_URL`, `APHRODY_LOCAL_MODEL_URL`) et avec `local` dans
`SHENRON_CHAT_BACKENDS` (défaut hors production : `local,gemini-web`), `shenron-server` lance
un seul `llama-server` enfant en mode routeur (un préréglage par modèle,
`$SHENRON_HOME/models/llama-presets.ini`, un modèle en mémoire à la fois, chargé à la demande)
sur un port de boucle locale, et pose `APHRODY_LOCAL_MODEL_URL` (et `APHRODY_AI_CHAT_MODEL` à
`shenron-chat-v2` s'il est absent). Modèles, par identifiant stable (`ChatRequest.model`) :

| Identifiant        | Modèle                                                                   | Provisionnement                                                                                                        |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `shenron-chat-v2`  | Qwen3-4B Instruct 2507 (GGUF Q4_K_M) + adaptateur LoRA `shenron-chat-v2` | Défaut. Base téléchargée au premier lancement ; adaptateur livré par l'installeur ou importé (aucune source publique). |
| `gemma4-e2b`       | Gemma 4 E2B instruct (GGUF Q4_K_M)                                       | Téléchargé après le défaut au premier lancement (`auto`), ou sur demande (`manual`).                                   |
| `gemini-web/flash` | Application web Gemini (distante), cookies Google d'Aphrody, sans clé    | Présent quand `aphrody-gemini-web` et un magasin de cookies existent (`~/.aphrody/google-cookies.json`…).              |

Les téléchargements passent par `aphrody model pull` (aphrody-models, magasin
`$SHENRON_HOME/models/aphrody`) quand le CLI `aphrody` est présent, sinon par le
téléchargeur du serveur : URL Hugging Face `resolve/<révision>` épinglée, reprise, SHA-256
vérifié, dans `$SHENRON_HOME/models/`. Un modèle déjà dans le magasin Aphrody de l'utilisateur
(`aphrody model path <id>`) est utilisé en place. Tous les modèles reçoivent le même prompt
système (persona de l'agent home, index du plugin `shenron`, mémoire).

`GET /api/v1/models` liste `models` (`ChatModelEntry` : `id`, `label`, `backend`,
`available`, `default`, `remote`, `state` `ready | loading | downloading | installable |
failed | unavailable`, `progress`, `installUrl`, `importUrl`, `detail`) et
`defaultModel`. Sur la machine seulement : `GET /api/local/models`,
`POST /api/local/models/gemma4-e2b/install` (téléchargement, 202) et
`POST /api/local/models/shenron-chat-v2/import` (`{ "path": "<adapter.gguf>" }`, empreinte
vérifiée, copie dans `$SHENRON_HOME/models/`). Le groupe `chat` de `/api/local/health` donne
l'étape du modèle par défaut (téléchargement en %, chargement, échec) puis les modèles servis.
L'installeur livre `llama/` (llama.cpp `b11312`, Vulkan) et `models/shenron-chat-v2.gguf`
(`scripts/build/desktop.ts`, `--skip-chat-model` pour s'en passer). Journal :
`$SHENRON_HOME/logs/llama-server.log`.

| Variable                     | Rôle                                                                                                                         | Défaut                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `SHENRON_CHAT_MODEL`         | `auto`, `off` ou chemin du GGUF de base. `auto` hors `desktop` l'active aussi (jamais en production).                        | `auto` en `desktop`, `off` sinon                                                     |
| `SHENRON_CHAT_MODEL_URL`     | Source de téléchargement de la base ; une source propre n'est pas vérifiée par empreinte.                                    | Hugging Face `unsloth/Qwen3-4B-Instruct-2507-GGUF`, révision épinglée                |
| `SHENRON_CHAT_LORA`          | Chemin de l'adaptateur, `off` pour la base seule.                                                                            | `$SHENRON_HOME/models/`, `models/` de l'installeur, puis `APHRODY_SHENRON_CHAT_LORA` |
| `SHENRON_CHAT_LORA_URL`      | Source de téléchargement de l'adaptateur (aucune publique : installeur ou import).                                           | aucune                                                                               |
| `SHENRON_GEMMA_MODEL`        | `auto` (téléchargé au premier lancement), `manual` (sur demande), `off` (absent de la liste) ou chemin du GGUF.              | `auto`                                                                               |
| `SHENRON_GEMMA_MODEL_URL`    | Source de téléchargement de Gemma 4 E2B (URL fournie pour le VPS, sinon la valeur provisoire).                               | Hugging Face `unsloth/gemma-4-E2B-it-GGUF`, révision `0314792` (provisoire)          |
| `SHENRON_GEMMA_MODEL_SHA256` | Empreinte de cette source ; sans elle, une URL propre n'est pas vérifiée.                                                    | empreinte épinglée du fichier Hugging Face                                           |
| `SHENRON_LLAMA_BIN`          | `llama-server` à lancer (fichier ou dossier), avant `APHRODY_LLAMA_BIN`.                                                     | `llama/` de l'installeur, puis le `PATH`                                             |
| `SHENRON_CHAT_CTX`           | Taille du contexte de chaque modèle.                                                                                         | `8192`                                                                               |
| `SHENRON_RESOURCE_DIR`       | Dossier des ressources de l'installeur (`llama/`, `models/`), posé par `shenron-desktop` ; sinon le dossier de l'exécutable. | dossier de l'exécutable                                                              |
| `SHENRON_PLUGIN_DIR`         | Plugin `shenron` (index dans le prompt de chaque modèle, `/api/public/plugin*`).                                             | `plugin/` du payload, à côté de l'exécutable, puis du dépôt                          |

Au build, l'adaptateur vient de `--chat-lora`, `SHENRON_CHAT_LORA` ou
`APHRODY_SHENRON_CHAT_LORA` et doit avoir l'empreinte épinglée ; les poids n'entrent jamais dans
Git.

## Traduction manga (Shenron Studio) — `crates/koharu-translator`, `crates/shenron-manga`

Le glossaire protège les termes canoniques pendant la traduction : chaque terme source reconnu
(le plus long d'abord, sans chevauchement) devient un jeton numéroté (`Zeta001`) que le moteur
recopie, puis la forme officielle le remplace ; un jeton que la table ne connaît pas fait
échouer la requête (`GlossaryTokens`) au lieu d'atteindre la planche. Le lexique canonique
(`data/lexicon/terms.json`, crate `shenron-lexicon`, paquet `@shenron/lexicon`) est embarqué
dans les binaires et sert le français et l'anglais ; `docs/architecture/lexicon.md` décrit le
format et la fin de vie de `data/lexique-db-canonique.json`, désormais un fichier dérivé.

| Variable                 | Rôle                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KOHARU_GLOSSARY`        | Chemin d'un glossaire JSON lu par `Translator::from_config` (`Glossary::from_env`, `crates/koharu-translator/src/glossary.rs`) : ancien tableau `{ "source", "target" }` ou format du lexique. Un fichier posé mais illisible ou invalide est une erreur. Posée, elle remplace le lexique embarqué ; vide, elle ne retire pas le lexique Shenron. |
| `KOHARU_GLOSSARY_TARGET` | Langue cible du glossaire de `KOHARU_GLOSSARY` (`fr` ou `en`) ; une langue inconnue est une erreur. Défaut : toutes les langues cibles.                                                                                                                                                                                                           |
| `SHENRON_LEXIQUE`        | Chemin d'un lexique remplaçant celui qui est embarqué (`crates/shenron-manga`, fonctionnalité `koharu` de `shenron-mcp` et `shenron-cli`). L'ancien format ne s'applique qu'au français ; un fichier invalide est ignoré avec un avertissement. `shenron-server` le pose vers le fichier du payload quand il est absent.                          |
| `SHENRON_KOHARU_SDK_BIN` | Chemin explicite de `koharu-sdk` pour `shenron-server` (pont `/api/local/koharu` de l'éditeur en navigateur local). Défaut : le binaire voisin du serveur.                                                                                                                                                                                        |
| `KOHARU_SHENRON_URL`     | URL de l'API Shenron utilisée par `koharu-sdk` (équivalent de son option `--shenron-url`).                                                                                                                                                                                                                                                        |

Le build de `shenron-server` (`scripts/build/server.ts`) embarque `data/lexique-db-canonique.json`
dans son payload (extrait sous `$SHENRON_HOME/cache/payload-<id>/data/`). Les projets de l'éditeur
vivent sous `$SHENRON_HOME/data/koharu/projects`, ses modèles sous
`$SHENRON_HOME/cache/koharu/packages` ; les réglages restent dans `~/.koharu/config.toml`
(`koharu-config`, Aphrody, n'accepte pas d'autre emplacement).

## Mémoire persistante du chat — `@shenron/config/memory`, `apps/server/src/memory.ts`

L'hôte de l'API (`shenron-server`, Shenron Studio) garde une mémoire par agent home dans le
fournisseur SQLite d'Aphrody (`aphrody-memory`, `SqliteLocalProvider`), atteint par
`shenron-ffi` (ABI 3, `@shenron/native`). L'agent-id est celui de l'agent home de
l'utilisateur : `discord:<user_id>` quand l'utilisateur Discord est connu, `local` sinon ; le
même pour tous les modèles. À chaque tour, les souvenirs pertinents sont joints à la question
(comme données, jamais comme sources ni instructions) ; après la réponse, les faits saillants
du message (« je m'appelle… », préférences, « souviens-toi que… ») sont écrits.
`memoryOptIn: false` dans la requête de chat tient le tour à l'écart. Le résolveur d'agent
home choisit la base de chaque home (`memoryLocation` de `createLocalApi`, option de
`startBackend`) ; sans lui, toutes partagent le fichier par défaut. Les enregistrements
`shenron/<propriétaire>` de la première version sont déplacés une fois dans le home au premier
accès. Routes : `GET /api/v1/memory`, `POST /api/v1/memory/{id}/delete`,
`POST /api/v1/memory/clear` ; sans bibliothèque native, le groupe `memory` de
`/api/local/health` est indisponible et le serveur continue.

| Variable                | Rôle                                                                      | Défaut                            |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| `SHENRON_MEMORY`        | `off` coupe la mémoire (rappel et écriture)                               | active                            |
| `SHENRON_MEMORY_DB`     | fichier SQLite par défaut (homes sans base propre ; créé en mode 600)     | `$SHENRON_DATA_DIR/memory.sqlite` |
| `SHENRON_MEMORY_RECALL` | souvenirs joints à un tour (0–20 ; 0 écrit sans rappeler)                 | `5`                               |
| `SHENRON_MEMORY_REMOTE` | `off` retire les souvenirs du prompt des backends distants (`gemini-web`) | active : tous les backends        |

## Chat du bot en messages privés — `@shenron/config/dm-chat`, `apps/bot/src/events/DirectMessageRelay.ts`

Tout membre de la guilde `GUILD_ID` reçoit une réponse du modèle en DM (persona Shenron, agent
home `discord:<id>` et sa mémoire) ; un non-membre, banni compris, reçoit un refus unique. Le
modèle de production (Gemma 4 E2B sur CPU, environ 15 tokens/s) sert peu de requêtes à la fois :
chaque DM passe par une file globale bornée, un utilisateur n'a qu'une requête en cours et un
quota par fenêtre ; les owners ne sont pas limités et passent en tête de file. Pas de streaming
(le serveur de chat répond d'un bloc) : l'indicateur « en train d'écrire » reste affiché
pendant la génération. Textes visibles : `apps/bot/src/locales/{fr,en,ja}.json`, langue
détectée dans le message.

| Variable                     | Rôle                                                           | Défaut |
| ---------------------------- | -------------------------------------------------------------- | ------ |
| `SHENRON_DM_CHAT`            | `off` : seuls les owners obtiennent une réponse du modèle      | active |
| `SHENRON_DM_CONCURRENCY`     | générations simultanées, toutes conversations confondues (1–8) | `2`    |
| `SHENRON_DM_QUEUE_MAX`       | demandes en attente au-delà (0–200) ; position annoncée        | `20`   |
| `SHENRON_DM_USER_MESSAGES`   | réponses par utilisateur et par fenêtre (1–100)                | `5`    |
| `SHENRON_DM_USER_WINDOW_S`   | durée de cette fenêtre, en secondes (10–86400)                 | `600`  |
| `SHENRON_DM_TIMEOUT_S`       | délai d'une génération, attente en file exclue (5–600)         | `90`   |
| `SHENRON_DM_MAX_TOKENS`      | `max_tokens` envoyé au serveur de chat direct (32–2048)        | `320`  |
| `SHENRON_DM_MAX_CHARS`       | longueur de la réponse envoyée, coupée à une phrase (200–2000) | `1800` |
| `SHENRON_DM_MAX_INPUT_CHARS` | caractères du message gardés pour la génération (100–4000)     | `1000` |

Mémoire : celle de l'agent home (`aphrody-memory` via `shenron-ffi`), active seulement quand
`SHENRON_FFI_LIB` désigne la bibliothèque native ; fichier `SHENRON_MEMORY_DB`, sinon
`memory.sqlite` à côté de `DATABASE_PATH` (`SHENRON_MEMORY`, `SHENRON_MEMORY_RECALL` comme
ci-dessus). Sans elle, le chat répond sans mémoire persistante (l'historique Redis de session
reste).

## Bot Discord — `apps/bot/src/lib/env.ts`

Validées par zod ; un identifiant absent désactive la fonctionnalité concernée. Modèle commenté :
`apps/bot/.env.example`.

- Discord : `DISCORD_TOKEN_SHENRON` (repli `DISCORD_TOKEN`), `APPLICATION_ID_SHENRON`
  (repli `APPLICATION_ID`), `DISCORD_PUBLIC_KEY`, `GUILD_ID`, `OWNER_ID` / `OWNER_IDS`,
  `BOT_DEV_ID`. Les variantes `*_BEERUS`, `*_WHIS`, `*_GRAND_PRETRE`, `*_ENMA`, `*_KAIO` sont
  des alias de compatibilité : elles ne créent aucun client.
- Salons et rôles : `*_CHANNEL_ID`, `JAIL_ROLE_ID`, `URL_IN_BIO_ROLE_ID`,
  `TICKET_CATEGORY_ID`, `VOCAL_TEMPO_HUB_ID`, `SERVER_INVITE_URL`.
- API : `API_ENABLED`, `API_HOST`, `API_PORT`, `API_ADMIN_TOKEN`, `API_USER_SECRET`.
- Divers : `LOG_LEVEL`, `NODE_ENV`.
