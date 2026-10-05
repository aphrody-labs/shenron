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
| `shenron-server` | `apps/server` | Binaire autonome du front : un `Bun.serve` frontal sert les assets statiques (`/_next/static`, `public/`), répond à `/api/local/*` et relaie le reste vers le `server.js` standalone de Next, lancé en processus enfant sur une adresse de boucle locale. |
| Site Next | `apps/site` | Next 16 App Router (standalone). `/koharu`, `/studio` et `/bureau` montent `@shenron/ui` ; `/mcp` relaie vers `shenron-mcp --http --public`. |
| `shenron-bot` | `apps/bot` | Bot Discord (discordx + tsyringe) et API du bot dans un seul processus Bun. |
| `shenron-mcp` | `crates/shenron-mcp` | Serveur MCP : stdio pour le plugin et les agents locaux (tous les outils), HTTP public en lecture seule derrière `/mcp` du site. |
| `shenron-desktop` | `crates/shenron-desktop` | Application Tauri 3 : lance `shenron-server` en sidecar et ouvre `/bureau`. |
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
- **API locale** : `GET /api/local/health` et `GET /api/local/rag/search`
  (corpus hors ligne par `bun:ffi` vers `libshenron_ffi`, livrée à côté de
  l'exécutable ou désignée par `SHENRON_FFI_LIB`).

Construction : `bun run build:server` (`--target linux-x64|windows-x64`,
`--flavor desktop|production`, `--skip-site`, `--no-embed`). Le build compile le
site sans base, aplatit `node_modules/.bun`, échoue sur toute donnée privée
(garde de `scripts/build/server.ts`) et emballe un payload zstd dans
`bun build --compile`. Sortie : `dist/server/<cible>/`.

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
