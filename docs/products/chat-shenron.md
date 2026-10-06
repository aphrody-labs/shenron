# Chat Shenron : bureau, site et bot

Le même assistant Shenron répond sur trois surfaces : **Shenron Studio** (application de bureau,
`/desktop`), **le site** (`/api/chat`) et **le bot Discord** (DM). Ce document décrit les
modèles, la persona, la mémoire et les limites de chaque surface. Le code fait foi ; les
variables se trouvent dans [`operations/ENV.md`](../operations/ENV.md), les processus dans
[`architecture/RUNTIME.md`](../architecture/RUNTIME.md).

## Modèles

| Identifiant        | Modèle                                                  | Où il tourne                                               |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------- |
| `shenron-chat-v2`  | Qwen3-4B Instruct 2507 Q4_K_M + adaptateur LoRA Shenron | bureau (défaut)                                            |
| `gemma4-e2b`       | Gemma 4 E2B instruct Q4_K_M (Unsloth, Apache-2.0)       | bureau (téléchargé à la demande), site et bot (production) |
| `gemini-web/flash` | application web Gemini, session Google de l'opérateur   | distant, facultatif                                        |

- **Bureau** : un seul `llama-server` en mode routeur (`apps/server/src/chat-model.ts`,
  défauts épinglés dans `@shenron/config/chat-model`), un modèle en mémoire à la fois.
  L'installeur livre le runtime llama.cpp (Vulkan) et l'adaptateur LoRA ; la base Qwen
  (2,5 Go) et Gemma (3,1 Go) se téléchargent au premier lancement ou en un clic, depuis
  Hugging Face à une révision épinglée, avec reprise et vérification SHA-256. Sans adaptateur,
  `POST /api/local/models/shenron-chat-v2/import {path}` l'importe depuis un fichier local.
- **Production** : Gemma 4 E2B est préchargé (poids verrouillés en mémoire) dans un service
  géré par `aphrody-infra`, joignable uniquement en boucle locale. Le site et le bot
  l'appellent quand `APHRODY_AI_CHAT_BASE_URL` est posé ; la recherche RAG reste sur
  `aphrody-ai-http`. Mesuré le 2026-10-06, sans GPU : premier jeton en environ 350 ms,
  14 à 15 jetons/s.
- **Liste** : `GET /api/v1/models` renvoie `{ order, backends, models, defaultModel, embedder }`.
  Chaque entrée porte `state` (`ready | loading | downloading | installable | failed | unavailable`) et, selon le cas, `progress`, `installUrl` ou `importUrl`. Le modèle se choisit
  à chaque requête (`ChatRequest.model`) ; `done.model` indique celui qui a répondu.
- **Gemini web** dépend des cookies Google de l'opérateur (`~/.aphrody/google-cookies.json`). Une
  session expirée le marque `unavailable` après le premier échec.

## Persona, agent home et plugin

- **Gabarit** : `templates/agent-home/`, au format natif d'aphrody-agent-home. Il porte la
  persona Shenron, les règles éditoriales (le manga, les scans et les déclarations d'Akira
  Toriyama priment, Fandom est interdit), la règle de langue fr/en/ja et un `USER.md` vide. Il
  est embarqué par `@shenron/db/agent-homes` (`bun packages/db/scripts/agent-home-template.ts --check` en CI) et copié dans le payload serveur ; la garde de `scripts/build/server.ts`
  refuse toute donnée privée.
- **Un home par utilisateur**, identifié par `discord:<user_id>`, sinon `local` :
  - **Bureau** : un home `local` est créé au premier lancement dans `<SHENRON_HOME>/agents/`.
    La connexion Discord (`POST /api/local/agent-home/login`) ouvre le navigateur système sur le
    site (`/api/desktop/link`, Better Auth), qui rend un code signé valable deux minutes ; le
    home devient alors `discord-<id>`, mémoire comprise.
  - **DM Discord** : le bot crée le home au premier message, dans PostgreSQL `chat.agent_homes`
    (migration `0020_chat_agent_homes.sql`, à appliquer par le runbook `aphrody-infra` ; tant
    qu'elle manque, le bot répond sans créer de home), sinon
    dans des fichiers à côté de sa base.
  - La synchronisation bureau ↔ cloud (instantanés complets, le plus récent `updatedAt` gagne)
    est conçue mais pas branchée.
- **Tous les modèles agissent comme Shenron** : le prompt système de chaque backend, Gemini web
  compris, porte la persona du home, les champs de l'utilisateur (nom, langue, fuseau,
  préférences, cités comme données), l'index du plugin `shenron` (`@shenron/api/plugin`, en
  contexte seulement, pas encore en outils appelables) et la mémoire.

## Mémoire persistante

- **Stockage** : `aphrody_memory` (`SqliteLocalProvider`) appelé par `crates/shenron-ffi`
  (ABI 3) via `@shenron/native` ; `apps/server/src/memory.ts` en fournit la fabrique à
  l'hôte. Une base par home (`<home>/.aphrody/memory.sqlite`, défaut
  `<SHENRON_HOME>/data/memory.sqlite`), créée en mode 600, chaque accès limité à un agent-id.
- **Un tour de chat** : jusqu'à 5 souvenirs pertinents sont joints à la question comme données
  (événement `memory:recall`), puis au plus 3 faits saillants sont écrits (présentation,
  préférences, « souviens-toi que… »). `done.memory` vaut `{ recalled, stored }` ;
  `memoryOptIn: false` exclut un tour. Une mémoire en panne ne fait jamais échouer le tour.
- **Modèles distants** : la mémoire est injectée pour tous les modèles par défaut ;
  `SHENRON_MEMORY_REMOTE=off` la garde en local.
- **Endpoints** (réservés au propriétaire) : `GET /api/v1/memory?q=&tag=&limit=`,
  `POST /api/v1/memory/{id}/delete`, `POST /api/v1/memory/clear` ; disponibilité dans
  `groups.memory` de `/api/local/health`. Côté bot, la mémoire n'est active que si
  `SHENRON_FFI_LIB` désigne la bibliothèque native, livrée avec la release.

## Surfaces

- **Shenron Studio** (`/desktop`, `packages/ui/src/chat`) : chat Material 3 assemblé sur
  `@aphrody/m3-ai` (MessageBubble, ChatComposer, ModelSelector), avec la liste des
  conversations persistées, les citations, l'état « modèle indisponible », un panneau mémoire
  (recherche, oubli, tout oublier) et un panneau modèles (installation de Gemma, import de
  l'adaptateur par le sélecteur de fichier natif). Les liens s'ouvrent dans le navigateur
  système. Libellés en fr, en et ja.
- **Bot en DM** (`apps/bot/src/events/DirectMessageRelay.ts`) : ouvert à tout membre de la
  guilde. Limites (défauts dans `@shenron/config/dm-chat`) : 2 générations simultanées,
  20 demandes en attente avec position annoncée, 1 requête en cours et 5 réponses par 10 min
  par utilisateur, 90 s par génération, 320 jetons et 1 800 caractères par réponse. Les owners
  ne sont pas limités et passent en tête de file ; `SHENRON_DM_CHAT=off` réserve le chat aux
  owners. Pas de streaming : l'indicateur « en train d'écrire » est renouvelé.

## Décisions du 2026-10-06

- L'adaptateur LoRA `shenron-chat-v2` est livré dans l'installeur : ce sont des poids, pas le
  corpus. Il n'a aucune source publique et n'est publié nulle part ailleurs.
- Aucun poids n'est republié sur un miroir Aphrody : les téléchargements partent de Hugging
  Face à une révision épinglée.
- Les capacités Aphrody se consomment, elles ne se réimplémentent pas. La règle du propriétaire
  d'Aphrody : WASM pour le web, binaire pour le bureau, FFI `bun:ffi` pour le backend Bun.
  Le routeur (`aphrody llama router`), le provisionnement (`aphrody llama provision`) et la
  mémoire (`aphrody memory …`, `aphrody_memory::local_ops`) d'Aphrody remplaceront le code de
  `apps/server/src/chat-model.ts` et de `crates/shenron-ffi/src/memory.rs`.

## Pistes ouvertes

- Modèle dans le navigateur : WebLLM avec Qwen3-4B fusionné à l'adaptateur (MLC `q4f16_1`,
  environ 2,3 Go), non encore converti ni testé.
- Prochain fine-tuning sur RTX 4070 (12 Go) : Qwen3.5-4B en LoRA bf16, qui exige transformers
  v5 dans le pipeline d'Aphrody ; repli immédiat sur Qwen3-4B-Instruct-2507 (environ 30 min
  pour 3 epochs).
- Remplacer le hub A2A de `@shenron/pipeline` (environ 2 000 lignes, ancien dialecte) par
  `@aphrody/a2a` dès sa publication ; passer les appels du binaire `aphrody` du pipeline par la
  FFI, ce qui demande d'ouvrir la garde `bun:ffi` à `@shenron/native`.
