# Runtime — processus et binaires de Shenron

Ce que le dépôt fait tourner et comment les processus se répartissent. Le code
fait foi ; la carte des paquets est dans [`STACK.md`](STACK.md), les variables
dans [`ENV.md`](../operations/ENV.md). Les unités systemd, les routes Nginx, le
CDN, les releases et les sauvegardes appartiennent à `aphrody-infra`
([`INFRA-DELEGATION.md`](../operations/INFRA-DELEGATION.md)) : aucun hôte ni port
de production n'est décrit ici.

## 1. Processus

| Processus | Code | Rôle |
| --- | --- | --- |
| `shenron-server` | `apps/server` | Binaire autonome : un `Bun.serve` frontal répond à `/api/local/*`, monte l'API Shenron (`@shenron/api/host` : `/api/v1/*`, `/api/public/*` depuis le VFS, WebSocket du chat, relais `/mcp`), sert les assets statiques (`/_next/static`, `public/`, `/assets/*` du VFS) et relaie le reste vers le `server.js` standalone de Next, lancé en processus enfant sur une adresse de boucle locale. |
| Site Next | `apps/site` | Next 16 App Router (standalone). `/koharu`, `/studio` et `/bureau` montent `@shenron/ui` ; `/mcp` relaie vers `shenron-mcp --http --public`. |
| `shenron-bot` | `apps/bot` | Bot Discord (discordx + tsyringe) et API du bot dans un seul processus Bun. |
| `shenron-mcp` | `crates/shenron-mcp` | Serveur MCP : stdio pour le plugin et les agents locaux (tous les outils), HTTP public en lecture seule derrière `/mcp` du site. |
| `shenron-desktop` | `crates/shenron-desktop` | Application Tauri 3 : lance `shenron-server` en sidecar (qui démarre lui-même le sidecar `shenron-mcp` livré à côté) et ouvre `/bureau`. |
| Lots | `scripts/ops/*`, `packages/pipeline/scripts/*` | Lancés à la main, hors runtime ; jamais `rag:build` au premier plan ni sur le bot de production. |

## 2. `shenron-server`

```sh
bun apps/server/src/cli.ts serve             # développement, sans payload embarqué
shenron-server [serve] [--port N] [--host H]  # front seul (défaut)
shenron-server serve all                      # front + binaire shenron-bot voisin
shenron-server paths | doctor | init | version
```

- **Site** : `SHENRON_SITE_DIR`, sinon `site/` à côté de l'exécutable.
- **`SHENRON_HOME`** (sinon le dossier de données de la plateforme) contient
  `config/shenron.env` (refusé s'il n'est pas en 600 sous Unix), `data/`,
  `cache/` et `logs/`. Précédence : environnement du processus, puis
  `config/shenron.env`, puis les défauts du profil.
- **Profils** (`SHENRON_PROFILE`) : `production` dès que `DATABASE_URL` est
  fourni par l'opérateur ; `desktop` et `public` utilisent les URL publiques de
  dragonballfr.com, sans secret. `doctor` ne signale que la présence des
  secrets, jamais leur valeur.
- **API locale** : `GET /api/local/health` (`LocalHealthResponse` de
  `@shenron/api/contract` : profil, `localRag` et `groups`, la disponibilité de chaque
  groupe `wiki | rag | chat | conversations | sync | vfs | ocr | mcp | models` avec une
  raison courte en français) et `GET /api/local/rag/search` (corpus hors ligne par
  `bun:ffi` vers `libshenron_ffi`, livrée à côté de l'exécutable ou désignée par
  `SHENRON_FFI_LIB`).
- **API Shenron** (`apps/server/src/backend.ts`, tous profils) : l'hôte
  `@shenron/api/host` câblé depuis `SHENRON_HOME` et le payload. VFS :
  `SHENRON_VFS_DB`, `<home>/data/shenron-vfs.sqlite`, le VFS public du payload, `vfs/`
  à côté de l'exécutable ; conversations : `<home>/data/conversations.sqlite` (ou
  `SHENRON_CHAT_PG_URL`) ; agent home : `/home` du VFS, `APHRODY_WORKSPACE`, sinon le
  modèle public du payload ; OCR : `APHRODY_BIN`, `aphrody` voisin ou du PATH ; MCP :
  `SHENRON_MCP_URL`, sinon le sidecar `shenron-mcp` livré à côté (`SHENRON_MCP_BIN`,
  `./`, `./binaries/`) lancé en `--http 127.0.0.1:<port libre> --public` ; chat :
  `SHENRON_CHAT_BACKENDS` (défaut `local` hors production) sur l'URL compatible OpenAI
  déclarée (`APHRODY_AI_CHAT_BASE_URL`, `APHRODY_SHENRON_LLM_BASE_URL`,
  `APHRODY_LOCAL_MODEL_URL` : llama-server, aphrody-llama-daemon). Une capacité absente
  désactive son groupe sans arrêter le serveur. En production, le wiki reste au site
  (PostgreSQL), seuls les nœuds publics du VFS sont servis et aucun propriétaire implicite
  de boucle locale n'existe (`SHENRON_LOCAL_OWNER` vide).
- **Ordre du frontal** (`apps/server/src/front.ts`), premier qui répond : `/api/local/*` ;
  `/api/v1/*` (l'hôte fait foi : un groupe désactivé rend son 404 JSON) ; `/api/public/*`
  et `/mcp` quand l'hôte les sert (sinon les routes du site, dont
  `app/api/public/[...route]` sur PostgreSQL) ; `/_next/static` et `public/` ;
  `/assets/*` du VFS ; enfin Next. `/api/health` reste celle du site. Les flux SSE du chat
  écrivent un commentaire toutes les 15 s, bien sous l'`idleTimeout` de 120 s.

Construction : `bun run build:server` (`--target linux-x64|windows-x64`,
`--flavor desktop|production`, `--skip-site`, `--no-embed`, `--vfs FICHIER` ou
`--no-vfs`). Le build compile le site sans base, aplatit `node_modules/.bun`, échoue sur
toute donnée privée (garde de `scripts/build/server.ts`), ajoute le VFS public
(`dist/vfs/shenron-vfs.public.sqlite` par défaut, refusé s'il n'est pas de profil
`public` ou s'il porte un nœud privé, une conversation ou un nœud embarqué) et le modèle
public de l'agent home, puis emballe un payload zstd dans `bun build --compile`. Sortie :
`dist/server/<cible>/`. `scripts/build/desktop.ts` compile en plus `shenron-mcp` pour la
cible et le déclare en `externalBin` (`--skip-mcp` pour s'en passer).

## 3. Bot

`entry-standalone.ts` accepte `--dry-run` (valide l'environnement sans services
ni connexion Discord) et `--smoke` (charge toutes les commandes et tous les
événements, sans base ni Discord), puis délègue à `index.ts` : migrations SQLite,
base, `ApiServer` et connexion Discord. Un seul client Gateway ; les tâches
périodiques passent par `CronRegistry` (`apps/bot/src/api/cron-registry.ts`).
Le barrel `apps/bot/src/_entries.ts` se régénère par
`bun --filter @shenron/bot gen:entries` après tout ajout ou retrait de commande
ou d'événement.

Construction : `bun run build:bot`.

## 4. Données

- PostgreSQL est la source éditoriale ; le SQLite du bot (`data/bot.db`, ses
  propres migrations) en est le réplica.
- La VFS `shenron-vfs.sqlite` (`packages/db/src/vfs/`) est embarquée dans les
  binaires : nœuds de fichiers, store RAG, wiki public. Elle se construit par
  `scripts/data/build-vfs.ts`.
- Le RAG local du bot (FTS5 + vecteurs) et la délégation à Aphrody
  (`RAG_BACKEND=aphrody`) sont décrits dans [`rag-enrichment.md`](rag-enrichment.md)
  et [`APHRODY-ECOSYSTEM.md`](APHRODY-ECOSYSTEM.md).

## 5. Pannes et arrêt

- Le rendu Next tourne dans un processus enfant : son échec n'arrête pas les
  assets statiques ni l'API locale du frontal.
- Sans services Aphrody, les modules RAG et LLM du bot s'importent sans
  erreur ; l'appelant reçoit un échec explicite et dégrade de façon documentée
  (recherche lexicale, repli de persona).
- Une écriture SQLite ad hoc sur la base du bot pendant qu'il tourne peut
  bloquer ses handlers HTTP : travailler sur une copie (voir
  [`pieges.md`](../guides/pieges.md)).
