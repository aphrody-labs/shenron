# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- CLAUDE.md est un lien symbolique vers AGENTS.md : un seul fichier pour tous les agents. -->

Shenron est le produit de dragonballfr.com : site, bot Discord, API, chaîne éditoriale (OCR et
traduction des databooks), moteur de traduction manga Koharu, RAG et serveur MCP. Répondre et
documenter en français. Exécuter de bout en bout ; commit et push à la fin de chaque lot vert,
auteur `aphrody-dev <contact@aphrody.com>`, sans mention d'assistant.

## Sources de vérité

- Index de la documentation : `docs/README.md`. Carte des paquets et graphe de dépendances
  autorisé : `docs/architecture/STACK.md` (§3–4), avec `RUNTIME.md` et `i18n.md` à côté. En
  cas d'écart, le code fait foi.
- Variables d'environnement : `docs/operations/ENV.md`. Les défauts codés ne vivent que dans
  `@shenron/config` ; le site lit l'environnement par `apps/site/src/lib/env.ts` (t3-env).
- Plan directeur : `docs/reference/root/PLAN.md` (invariants éditoriaux). Mémoire datée :
  `data/home/MEMORY.md`, privée et ignorée par Git. Les rapports générés (signalements,
  objectifs, audits i18n/SEO, profils) s'écrivent dans `var/reports/`, jamais dans `docs/`.

## Périmètre et propriétaires

- Produit : `apps/site` (application frontale unique), `apps/bot`, `apps/server`
  (`shenron-server`), `packages/ui` (couche UI unique), `crates/shenron-*`, `crates/koharu-*`,
  `plugin/` (plugin Claude Code « shenron »).
- Aphrody fournit les capacités (socle ML `koharu-{llama,torch,diffusion,runtime,config}`,
  `aphrody-rag`, `aphrody-ocr`, `aphrody-models`, `aphrody-translate`, Tauri 3
  `aphrody-tauri*`, paquets npm `@aphrody/*`) : on les consomme, on ne les copie pas.
- L'hébergement (systemd, nginx, CDN, sauvegardes, migrations de production) appartient à
  l'Infra d'Aphrody (`aphrody-infra`) ; ce dépôt livre les artefacts (`dist/`, `deploy/`) et
  ne modifie aucun hôte.
- Travail parallèle : un seul écrivain par chemin, revendications dans
  `.coord/claims/<agent>.json` (`paths`, `released`) à lire avant d'écrire ;
  `git commit --only -- <chemins>` ; jamais `git add -A`, `stash`, `reset` ni checkout global.
  L'arbre de travail porte souvent le travail non commité d'autres agents : une porte rouge
  dans un chemin revendiqué par un autre se signale, elle ne se corrige pas.

## Outils

Bun (`bun`, `bun -e`, Bun Shell, `bun test`, `bun build --compile`) et Rust (`cargo`, via
`~/aphrody/scripts/build/rust/cargo-serial.sh` sur les machines Aphrody). Recherche : `rg`,
`fd`. Pas de node/npm/npx/bunx ni d'utilitaires GNU pour le travail d'agent ; oxlint/oxfmt via
`bun $(which oxlint)`. Le `tsc` local (TypeScript 7.0.2) fait seul foi.

`bunfig.toml` : `linker = "isolated"`, seuls `react` et `react-dom` sont hissés
(`hoistPattern`) ; chaque paquet déclare ses dépendances, scripts racine compris (le
`package.json` racine déclare ce qu'importe `scripts/`) ; versions tierces centralisées dans `workspaces.catalog` du `package.json` racine
(`"catalog:"`), `@aphrody/*` épinglés exactement ; `minimumReleaseAge` de 3 jours.

## Commandes

```sh
bun install --frozen-lockfile          # ou bun ci
bun run typecheck                      # tsc 7 dans chacun des 13 paquets
bun run lint                           # oxlint (.oxlintrc.json) sur apps packages scripts
bun run test                           # bun test de chaque paquet, *.live.test.ts exclus
bun run format:check                   # oxfmt
bun run --filter @shenron/db test      # un seul paquet
cd packages/db && bun test test/vfs-data.test.ts -t "motif"   # un fichier, un test
cd apps/site && bun test --isolate tests/<fichier>.test.ts    # apps site et bot : --isolate
bun run test:scripts                   # tests de scripts/ (bun test ./scripts)
bun run test:live                      # suites live (SHENRON_LIVE=1, services réels)
```

Contrôles de dérive (CI) : `bun packages/api/scripts/openapi.ts --check` (sans `--check`, il
régénère `packages/api/openapi/public.json`, à commiter), `bun packages/ui/scripts/generate-tokens.ts --check`,
`bun packages/pipeline/scripts/ai/check-contracts.ts`. Migrations : audit hors ligne par
`bun run --filter @shenron/db audit:migrations`.

Rust : `bun run check:rust`, `bun run clippy:rust` (`-D warnings`), `bun run test:rust`
(liste `-p` des crates Shenron), `cargo test -p shenron-rag <filtre>`. Le bloc généré de
`[workspace.dependencies]` se régénère par `bun scripts/build/rust/workspace-deps.ts [--check]`
(Aphrody en `git` à une `rev`) ; pour compiler contre un checkout local :
`bun scripts/build/rust/local-aphrody-patch.ts ~/aphrody --fetch`.

Lancer et construire :

- `bun --filter @shenron/site dev` (Next, `.next-dev` ; `predev` copie les assets de
  `packages/ui/assets` vers `public/`) ; `bun --filter @shenron/bot dev`.
- `bun apps/server/src/cli.ts serve|doctor|paths|init` (le site standalone vient de
  `SHENRON_SITE_DIR` ou de `site/` à côté du binaire).
- `bun run build:server` (`--target linux-x64|windows-x64`, `--flavor desktop|production`,
  `--skip-site`, `--no-embed`), `bun run build:bot`, `bun scripts/build/desktop.ts`
  (installeur NSIS), `cargo build --release -p shenron-{cli,mcp,desktop}`.
- Après ajout ou retrait d'une commande ou d'un événement discordx :
  `bun --filter @shenron/bot gen:entries` (barrel `apps/bot/src/_entries.ts`, commité).
- `bun --filter @shenron/koharu protocol` régénère `packages/koharu/src/protocol.ts` (Specta) ;
  `build:wasm` reconstruit `koharu-canvas`.

## Architecture

- **Graphe** : acyclique, `config ← db/auth ← api` ; `@shenron/ui` ne dépend que de `config`,
  `koharu` et `pipeline` ; aucun paquet n'importe une app. Chaque export déclare une classe `"shenron.runtime"`
  (`pure | server | bun | json`) auditée par `scripts/audit/check-workspace-packages.ts` :
  un module `"use client"` n'importe ni `@shenron/db/postgres-js`, ni `api/server`, ni rien
  de classe `bun`. `next.config.ts` liste chaque `@shenron/*` et `@aphrody/*` dans
  `transpilePackages`.
- **Données** : PostgreSQL est la source éditoriale (Drizzle, `packages/db/src/schema.ts` pour
  le site, `bot-schema.ts` pour le schéma `bot`) ; le SQLite du bot (`data/bot.db`, ses propres
  migrations) en est le réplica. Migrations du site dans `apps/site/src/db/migrations` ;
  `db:push` est interdit, l'application passe par le runbook `aphrody-infra`. Suppression
  éditoriale toujours logique (`visible = false`) et révisée dans `wiki_revisions`.
- **VFS** (`packages/db/src/vfs/`) : une base `shenron-vfs.sqlite` embarquée dans les binaires
  (nœuds de fichiers, store aphrody-rag, wiki public), recherche FTS5 BM25 fusionnée RRF avec
  un cosinus e5 ; construite par `scripts/data/build-vfs.ts`. Le store de conversations
  (`src/conversations/`) a le même contrat en SQLite local et en PostgreSQL (schéma `chat`),
  last-writer-wins sur `updatedAt`.
- **API** : `@shenron/api/contract` est le catalogue zod v4 des endpoints (auth, cache, SSE,
  WebSocket) ; `server/` est un routeur `Bun.serve` natif (pas Hono), `createShenronApi(ports)`
  n'active que les groupes dont les ports sont fournis. Le site le monte par
  `app/api/public/[...route]` (`toNextRouteHandlers`), le bot en repli après ses routes
  historiques (plus `/graphql` en lecture seule). L'OpenAPI 3.1 est dérivée du contrat.
- **Site** : Next 16 App Router, Turbopack ; `src/proxy.ts` remplace le middleware (host
  canonique, garde admin) ; next-intl par cookie `NEXT_LOCALE`, sans segment `[locale]`
  (`messages/{fr,en,ja}.json`). `/koharu`, `/studio`, `/bureau` montent `@shenron/ui`.
  `/mcp` relaie vers `shenron-mcp --http --public`.
- **Bot** : discordx + tsyringe ; `entry-standalone.ts` (`--smoke`, `--dry-run`) puis
  `index.ts` (migrations, base, `ApiServer`, Discord).
- **Binaire autonome** (`apps/server`) : un `Bun.serve` frontal sert `/api/local/*`
  (`bun:ffi` vers `libshenron_ffi`), les assets statiques, et relaie le reste vers le
  `server.js` standalone de Next lancé en processus enfant. `SHENRON_HOME` contient
  `config/shenron.env` (refusé s'il n'est pas en 600) ; profil `production` dès que
  `DATABASE_URL` est posé, sinon URLs publiques de dragonballfr.com. Le build compile le site
  sans base, aplatit `node_modules/.bun`, échoue sur toute donnée privée, emballe un payload
  zstd dans `bun build --compile`. `shenron-desktop` (Tauri 3) lance ce serveur en sidecar et
  ouvre `/bureau`.
- **Natif** : `@shenron/native` (`bun:ffi` vers `crates/shenron-ffi`, `SHENRON_FFI_LIB`) ;
  `@shenron/koharu` parle au moteur par Tauri ou par `koharu-sdk` en JSON Lines sur stdio.
  Les globals Tauri se lisent par `globalThis.__TAURI_INTERNALS__`.
- **Chaîne éditoriale** : `bun run --filter @shenron/pipeline pipeline <ocr|rag|ia|translation|crawl|unify>`
  délègue le calcul à Aphrody.

## Portes et invariants

- `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test`, `bun run lint` ; Rust :
  `bun run clippy:rust`, `bun run test:rust`. La CI GitHub (`.github/workflows/ci.yml`) ne
  couvre que Bun.
- Les suites `*.live.test.ts` (et `describe.if(LIVE)`) exigent les services réels.
- Manga, scans et déclarations d'Akira Toriyama priment ; Fandom est interdit comme source.
  Aucune écriture OCR/traduction pendant un gel des databooks ; `rag:build` jamais au premier
  plan ni sur le bot de production.
- Données privées (bases, corpus, identifiants, `data/home/`, `.env`) : jamais dans Git ni
  dans un artefact public ; le build public passe une garde (`scripts/build/server.ts`).
