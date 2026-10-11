# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- CLAUDE.md est un lien symbolique vers AGENTS.md : un seul fichier pour tous les agents. -->

**Avant toute modification de code, lire [START-HERE.md](START-HERE.md)** (équipe, règles, hôtes, tunnel,
contrôle à distance, travaux en cours ; source canonique dans `aphrody-labs/aphrody`).

Shenron est le produit de dragonballfr.com : site, bot Discord, API, chaîne éditoriale (OCR et
traduction des databooks), Shenron Studio (éditeur de traduction manga, nom de code Koharu), RAG
et serveur MCP. Répondre et documenter en français ; le code, lui, est en anglais (voir « Langues
et noms »). Exécuter de bout en bout ; commit et push à la fin de chaque lot vert,
auteur `aphrody-dev <contact@aphrody.com>`, sans mention d'assistant.
Poste propriétaire : Windows natif, sans démarrer WSL. Les builds lourds (Cargo, images Docker) tournent sur la fabrique VPS ; dbfr reçoit uniquement les binaires et images scellés. Les étapes longues tournent dans tmux ([runbook conteneurs](docs/operations/CONTAINER-COMPLET.md)). Le développement distant passe par `bun scripts/dev/remote-dev.ts up` (`just remote`, [runbook](docs/development/remote-dev.md)). Résoudre les hôtes et chemins depuis la configuration courante ; les règles de données (`db:push`, sources éditoriales) restent en vigueur.

Mémoire des conversations : avant tout travail substantiel, lire `data/home/MEMORY.md` s'il existe (privé, ignoré par Git) et `docs/reference/root/REPRISE.md`. À la fin de tout échange substantiel, y ajouter un résumé daté des faits nouveaux, décisions, préférences, points en suspens et prochaine étape ; mettre à jour les éléments durables et retirer ceux devenus faux. Ne pas y recopier les secrets. Ne pas prétendre se souvenir d'un échange absent du contexte ou des notes. Cette mémoire est un résumé, pas une transcription : l'historique mot à mot doit être exporté séparément s'il doit être conservé.

Session cloud : `docs/operations/CLOUD-SESSION.md` (hooks, SSH, secrets) ; chantiers ouverts dans `docs/reference/root/REPRISE.md`, lus au démarrage et repris sans demander jusqu'à la production.

Actualités urgentes (demande propriétaire du 2026-10-11) : suivre la priorité courante de
`GOAL.md`, vérifier dates et annonces dans les sources officielles avant publication.
Collecte Codex distante DBFR par Infra, jobs bornés et journaux privés ; PostgreSQL par les
writers éditoriaux, Redis par l'invalidation ciblée propriétaire. Ne pas convertir une
annonce de diffusion en preuve de lecture d'un épisode. La publication npm/crates.io exige
un artefact qualifié, l'audit de ses fichiers et une version disponible. La demande explicite
de publication autorise la préparation publique des bibliothèques avec allowlists relues ;
les applications, données et stores restent protégés. Ne pas déclarer une publication à
partir d'une archive préparée ou d'une authentification seule. Le CMS public utilise ses
routes `/news` et son ISR propriétaire. Le miroir public Redis appartient à
`apps/site/src/lib/posts-redis-shared.ts` et au wrapper `posts-redis.ts` : DB4,
`dbfr:post:<id>`/`dbfr:posts:all`, TTL24h, uniquement articles publiés. Reconstruire par
`scripts/ops/rebuild-news-redis.ts`, jamais FLUSH ni un writer PostgreSQL parallèle.
Qualifier séparément le backfill, l'image active et une écriture CMS→Redis réelle.

Synchronisation autorisée le11octobre2026 : maintenir README, ce fichier, GOAL et le plan
depuis les propriétaires réels, générer le plugin par `scripts/plugin/sync.ts`
et ses manifestes canoniques, puis vérifier la dérive. Le relevé registry/publication
`scripts/ops/sync-source-status.ts` écrit uniquement dans `var/reports/source-sync/` ;
HTTP200 metadata ne prouve ni installation, intégrité d'archive ni déploiement.
Les12bibliothèques npm sont `@aphrody/shenron-*`, les apps privées ; GitHub contrôlé
`aphrody-labs/shenron`, équipe `aphrody`. Conserver noms globaux et notices upstream des
crates. Aucune réécriture des migrations SQL historiques, y compris leurs commentaires.
Les tâches autonomes respectent les gates Infra DNSSEC/DS/TTL, stores protégés et claims.

Collecte et lecteurs (demande du11octobre2026) : le crawl Bun garde les captures complètes
privées ; publier uniquement notices originales et médias autorisés avec provenance.
`payload.public_excerpt` contrôle l'extrait visible, les droits refusés restent refusés ;
aucun intake n'active implicitement RAG, entraînement ou canon. Catalogues : writers
canoniques, snapshot complet/frais, backup, JSONarray validé, comparaison optimiste,
relecture et replay ; ne pas employer le delegate privé Bun.SQL mal encodé puis restauré.
Bun.WebView ou AphrodyWeb servent les tests navigateur réels ; les noms Chromium/Video
ne prouvent pas une API installée. Fournisseurs protégés restent liens officiels quand
l'embed est indisponible ; aucune lecture/territoire/langue ni licence ne s'invente.
## Exécution autonome NHIL

L’utilisateur a autorisé l’exécution autonome de bout en bout dans le périmètre de chaque
demande, l’usage des CLI/MCP/skills pertinents et la délégation parallèle des sous-tâches
indépendantes. Au début d’un travail substantiel, formuler l’objectif concret depuis la demande
courante, reprendre l’objectif actif correspondant s’il existe, puis poursuivre jusqu’aux portes
requises et à la livraison sans demander de confirmation intermédiaire. Trancher les choix
réversibles, continuer les tâches indépendantes en cas de blocage, déléguer par défaut quand cela
réduit réellement le délai et revendiquer des chemins disjoints. Garder les tâches simples ou
fortement couplées dans un seul fil ; relire chaque résultat délégué.

Cette autorisation ne change ni le périmètre demandé, ni les accès disponibles, ni les règles
données, les politiques des outils/reviewers ou les propriétaires techniques. Ne pas transformer
un ancien backlog en nouvelle demande. Si une approbation externe exacte ou une décision
indispensable du propriétaire manque, terminer d’abord le travail indépendant autorisé puis
rapporter le blocage concret. Suivre le skill global `nhil` et son rappel au démarrage.

Graphe de code : Graphify (`uv tool install graphifyy`, skill `/graphify`) indexe le code localement, sans LLM (`.graphifyignore`). `graphify update .` construit ou rafraîchit le graphe ; préférer `graphify query "<question>"`, `graphify explain` ou `graphify path` aux greps larges quand `graphify-out/graph.json` existe (sortie locale, ignorée par Git).

## Langues et noms

- Code (identifiants, commentaires nouveaux), slugs, segments de routes, chemins et champs d'API,
  schémas, clés de configuration, noms d'outils MCP, bot et backend : en anglais. Un ancien
  segment français reste servi par un 308 vers son équivalent anglais.
- Aucun texte visible codé en dur, ni en français ni ailleurs : toute chaîne d'interface passe
  par les dictionnaires (`apps/site/messages/{fr,en,ja}.json`, locales des paquets). Le français
  est la langue de référence ; l'anglais et le japonais sont complets. Les API acceptent la
  langue (`lang` ou `Accept-Language`, `fr | en | ja`) et renvoient les libellés localisés.
- Un seul lexique de traduction (personnages, techniques, lieux… en ja/fr/en) sert le site,
  l'API, le bot, le plugin, le pipeline et le traducteur de Shenron Studio.
- Koharu est un nom de code interne (crates `koharu-*`, `@aphrody/shenron-koharu`) : le produit public
  est **Shenron Studio**, et aucun texte visible ne dit « Koharu ».
- La documentation (`docs/`) reste en français.

## Sources de vérité

- Index de la documentation : `docs/README.md`. Carte des paquets et graphe de dépendances
  autorisé : `docs/architecture/STACK.md` (§3–4), avec `RUNTIME.md` et `i18n.md` à côté. En
  cas d'écart, le code fait foi.
- Variables d'environnement : `docs/operations/ENV.md`. Les défauts codés ne vivent que dans
  `@aphrody/shenron-config` ; le site lit l'environnement par `apps/site/src/lib/env.ts` (t3-env).
- Plan directeur : `docs/reference/root/PLAN.md` (invariants éditoriaux). Mémoire datée :
  `data/home/MEMORY.md`, privée et ignorée par Git. Les rapports générés (signalements,
  objectifs, audits i18n/SEO, profils) s'écrivent dans `var/reports/`, jamais dans `docs/`.

## Périmètre et propriétaires

- Produit : `apps/site` (application frontale unique), `apps/bot`, `apps/server`
  (`shenron-server`), `packages/ui` (couche UI unique), `crates/shenron-*`, `crates/koharu-*`,
  `plugin/` (plugin Claude Code « shenron », version dans `plugin/.claude-plugin/plugin.json` ;
  installation : `claude plugin marketplace add <dépôt>` puis `claude plugin install shenron@shenron`,
  le dépôt déclare la marketplace dans `.claude-plugin/marketplace.json`).
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
Rust : `just` (tâches Bun et Rust, `just --list`), alias Cargo de `.cargo/config.toml`
(`cargo ck|lint|t|koharu|wasm`), cargo-nextest, cargo-deny ; référence `docs/development/rust.md`.

`bunfig.toml` : `linker = "isolated"`, seuls `react` et `react-dom` sont hissés
(`hoistPattern`) ; chaque paquet déclare ses dépendances, scripts racine compris (le
`package.json` racine déclare ce qu'importe `scripts/`) ; versions tierces centralisées dans `workspaces.catalog` du `package.json` racine
(`"catalog:"`), `@aphrody/*` épinglés exactement ; `minimumReleaseAge` de 3 jours.

## Commandes

```sh
bun install --frozen-lockfile          # ou bun ci
bun run typecheck                      # tsc 7 : les 13 paquets, puis scripts/ (scripts/tsconfig.json)
bun run lint                           # oxlint (.oxlintrc.json) sur apps packages scripts
bun run test                           # bun test de chaque paquet, *.live.test.ts exclus
bun run format:check                   # oxfmt
bun run --filter @aphrody/shenron-db test      # un seul paquet
cd packages/db && bun test test/vfs-data.test.ts -t "motif"   # un fichier, un test
cd apps/site && bun test --isolate tests/<fichier>.test.ts    # apps site et bot : --isolate
bun run test:scripts                   # tests de scripts/ (bun test ./scripts)
bun run test:live                      # suites live (SHENRON_LIVE=1, services réels)
```

Contrôles de dérive (CI) : `bun packages/api/scripts/openapi.ts --check` (sans `--check`, il
régénère `packages/api/openapi/public.json`, à commiter), `bun packages/ui/scripts/generate-tokens.ts --check`,
`bun packages/pipeline/scripts/ai/check-contracts.ts`. Migrations : audit hors ligne par
`bun run --filter @aphrody/shenron-db audit:migrations`.

Rust : `bun run check:rust`, `bun run clippy:rust` (`-D warnings`), `bun run test:rust`
(nextest sur les crates de `cargo metadata`), `cargo nextest run -p shenron-rag <filtre>`. Le bloc généré de
`[workspace.dependencies]` se régénère par `bun scripts/build/rust/workspace-deps.ts [--check]`
(Aphrody en `git` à une `rev`) ; pour compiler contre un checkout local :
`bun scripts/build/rust/local-aphrody-patch.ts ~/aphrody --fetch`.

Lancer et construire :

- `bun --filter @aphrody/shenron-site dev` (Next, `.next-dev` ; `predev` copie les assets de
  `packages/ui/assets` vers `public/`) ; `bun --filter @aphrody/shenron-bot dev`.
- `bun apps/server/src/cli.ts serve|doctor|paths|init` (le site standalone vient de
  `SHENRON_SITE_DIR` ou de `site/` à côté du binaire).
- `bun run build:server` (`--target linux-x64|windows-x64`, `--flavor desktop|production`,
  `--skip-site`, `--no-embed`), `bun run build:bot`, `bun scripts/build/desktop.ts`
  (installeur NSIS), `cargo build --release -p shenron-{cli,mcp,desktop}`.
- Après ajout ou retrait d'une commande ou d'un événement discordx :
  `bun --filter @aphrody/shenron-bot gen:entries` (barrel `apps/bot/src/_entries.ts`, commité).
- `bun --filter @aphrody/shenron-koharu protocol` régénère `packages/koharu/src/protocol.ts` (Specta) ;
  `build:wasm` reconstruit `koharu-canvas`.

## Workflow direct : lecteurs et livraison

Procédure qualifiée le 2026-10-10. Vérifier la configuration et l'aide installées avant
de réutiliser les chemins distants ; cette date ne garantit pas leur disponibilité future.

### Exécuter un lot sans refaire la découverte

1. Lire les consignes et le plan, `git status --short` et les revendications `.coord/claims` ;
   revendiquer uniquement les chemins du lot. Réutiliser les capacités installées et les
   rapports existants ; conserver un `TODO.md` borné et ne pas rouvrir un chantier livré.
2. Reproduire le défaut sur le lecteur réel, puis corriger son propriétaire. Manga :
   `@aphrody/m3-reader/source`, styles consommateurs dans `packages/ui/src/reader-styles.css`.
   Databooks : `packages/ui/src/reader/DatabookReader.tsx`, pas la distribution M3 installée.
3. Valider les chemins modifiés et les comportements concernés. Depuis `apps/site`, utiliser
   `bun test --isolate tests/<fichier>.test.ts` ; `bun --cwd apps/site test ...` peut lancer
   le script du paquet et toute la suite. Depuis la racine : `bun run oxfmt --write <chemins>`.
   Pour une modification documentaire seule : contrôle du diff et des liens, sans build moteur.
4. Relire le diff, commiter uniquement les chemins possédés, puis `git fetch origin` et
   `git merge-base --is-ancestor origin/main HEAD` avant le push normal. Si la vérification
   échoue, intégrer les nouveaux commits en préservant les travaux concurrents, sans autostash.
   Libérer la revendication après livraison ; rapporter les preuves et limites réelles.

### Crawl et contrôle du rendu

- Combiner `aphrody web crawl` récursif, limité aux routes publiques concernées, avec
  `bun scripts/ops/audit-readers.ts --origin https://dragonballfr.com --out var/reports/readers --concurrency 3 --embeds`.
  Le crawl HTML seul ne couvre pas les catalogues paginés ; le script parcourt leurs API.
  `--frontier <fichier.sqlite>` permet de reprendre les URL du crawl natif. Sur le VPS,
  placer les rapports dans le foyer du profil dbfr, hors du worktree de build nettoyable.
- Réessayer les erreurs réseau après stabilisation du déploiement. `/api/health` est la
  sonde publique ; `/api/public/health` n'est pas une sonde supportée. Le GET de
  `/api/databooks/:id/pages` renvoie normalement 405 : cette route est PATCH uniquement.
- `reader-assets.ts` centralise les scans locaux : `/assets/manga/...` reste local,
  `/assets/wiki/...` devient `/wiki/...` sur le site. Conserver les paramètres et les sources
  externes étrangères ; les assets éditables locaux doivent refléter les remplacements admin.
- Contrôler en navigateur les éditions manga, les modes vertical/paginé des databooks et
  les largeurs 1280/390 : `naturalWidth > 0`, largeur affichée positive, pagination et absence
  de débordement. Une image chargée peut mesurer 2 px ; les grilles/Swiper exigent des
  colonnes `minmax(0, 1fr)` et des enfants `min-width: 0`.
- Canvas admin : attendre la réponse réelle des membres Discord et vérifier les cinq
  aperçus. Les valeurs par défaut suivent les données asynchrones sans écraser les choix.
  Vidéos : tester une panne réseau du fournisseur et le repli dans la même langue ;
  `iframe.onload` et HTTP 200 ne prouvent pas la lecture effective d'un épisode ou film.
- Préférer Aphrody Web avec `@aphrody/agent-browser/engine` et `@aphrody/web-test`
  ([exemple live](scripts/testing/integration/test/dev.live.test.ts)). Résoudre la bibliothèque
  native qualifiée depuis la configuration ; `YOLO_RUNTIME_LIB` éventuel reste propre au job.
  Fermer page et moteur en `finally`. Auth admin par session autorisée, cookies limités au
  domaine et supprimés après contrôle ; aucun en-tête secret global vers les iframes externes.

### Fabrique VPS → image scellée → DBFR

1. Vérifier les rôles avec `aphrody infra ssh exec --host vps -c 'hostname'` et l'équivalent
   `--host dbfr`. Au contrôle du 2026-10-10 : fabrique `vps-203bea89`, production `vps-6732365f`.
   `scripts/ops/release.ts` utilise un ancien contexte : inspecter son routage avant usage.
2. Sur la fabrique, inspecter les helpers installés `~/shenron-docker-build.sh` et
   `~/ship-shenron.sh`, le checkout et le verrou de build. Lancer le build dans tmux,
   journal durable avec statut terminal explicite, puis attendre son succès. Le helper
   utilise actuellement `~/build/transient/shenron-docker` et sérialise Cargo par le verrou lourd.
3. Vérifier le SHA du worktree, l'image correspondante, `version` et le bot `--smoke`.
   Lancer ensuite `~/ship-shenron.sh` dans tmux et attendre son succès : il capture le SHA
   du worktree au lancement. Ne pas lancer un nouveau build qui déplace ce HEAD pendant
   la livraison. DBFR charge l'image, assemble/scelle/vérifie puis active via Infra.
4. Vérifier la release active (`readlink -f /srv/shenron/current`), les conteneurs, la santé
   publique et les lecteurs réellement rendus. Conserver le chemin de rollback fourni.
   Une modification de documentation seule ne nécessite aucun déploiement.

Après inspection des helpers, commandes à exécuter dans le shell Bash de la fabrique
(attendre `EXIT_CODE=0` du build avant de lancer la livraison) :

```bash
tmux new-session -d -s shenron-build 'bash "$HOME/shenron-docker-build.sh" > "$HOME/shenron-build.log" 2>&1; code=$?; printf "EXIT_CODE=%s\n" "$code" >> "$HOME/shenron-build.log"'
tmux new-session -d -s shenron-ship 'bash "$HOME/ship-shenron.sh" > "$HOME/shenron-ship.log" 2>&1; code=$?; printf "EXIT_CODE=%s\n" "$code" >> "$HOME/shenron-ship.log"'
```

En cas d'échec, lire la dernière étape et le code de sortie avant de relancer. Pour `ENOSPC`,
inventorier l'espace de `/`, `/tmp` et du disque de build ; ne jamais purger les volumes Docker
ou les données protégées. Si le SHA et le standalone Next déjà construit sont inchangés,
reprendre avec `bun scripts/build/server.ts --flavor production --target linux-x64 --skip-site`
et un `TMPDIR` propre au job sur le disque qualifié, puis terminer les contrôles de l'image.
Conserver les wrappers/verrous Cargo. Les scripts `.sh` transférés depuis Windows doivent être
en LF : un CR final peut invalider une référence Docker. Les contrôles navigateur longs vont
aussi dans tmux : le timeout SSH peut perdre la sortie partielle. Sonder les logs par extraits
bornés plutôt que relancer le travail.

## Architecture

- **Graphe** : acyclique, `config ← db/auth ← api` ; `@aphrody/shenron-ui` ne dépend que de `config`,
  `koharu` et `pipeline` ; aucun paquet n'importe une app. Chaque export déclare une classe `"shenron.runtime"`
  (`pure | server | bun | json`) auditée par `scripts/audit/check-workspace-packages.ts` :
  un module `"use client"` n'importe ni `@aphrody/shenron-db/postgres-js`, ni `api/server`, ni rien
  de classe `bun`. `next.config.ts` liste chaque `@aphrody/shenron-*` et `@aphrody/*` dans
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
- **API** : `@aphrody/shenron-api/contract` est le catalogue zod v4 des endpoints (auth, cache, SSE,
  WebSocket) ; `server/` est un routeur `Bun.serve` natif (pas Hono), `createShenronApi(ports)`
  n'active que les groupes dont les ports sont fournis. Le site le monte par
  `app/api/public/[...route]` (`toNextRouteHandlers`), le bot en repli après ses routes
  historiques (plus `/graphql` en lecture seule). L'OpenAPI 3.1 est dérivée du contrat.
- **Site** : Next 16 App Router, Turbopack ; `src/proxy.ts` remplace le middleware (host
  canonique, garde admin) ; next-intl par cookie `NEXT_LOCALE`, sans segment `[locale]`
  (`messages/{fr,en,ja}.json`). `/studio` (Shenron Studio, l'éditeur de traduction manga), `/desktop` (accueil de
  l'application de bureau) et `/desktop/control` (son pilotage) montent `@aphrody/shenron-ui`.
  Espace Bibliothèque (`src/lib/library.ts`) : `/wiki/manga`, `/wiki/databooks`, `/workshop`
  (avancement public ; outils staff `/workshop/{transcription,translation,databooks/[id]}`, gardés
  par `proxy.ts` comme `/admin`) et `/studio` partagent leurs onglets. Les anciennes adresses
  (françaises, `/koharu`, `/bureau`) vivent dans `src/lib/legacy-routes.ts` : 308 de
  `next.config.ts` (pages publiques),
  308 du proxy après la garde (admin, outils staff), `rewrite` vers le handler anglais (API) ;
  `tests/english-routes.test.ts` refuse tout nouveau segment français.
  `/mcp` relaie vers `shenron-mcp --http --public`.
- **Bot** : discordx + tsyringe ; `entry-standalone.ts` (`--smoke`, `--dry-run`) puis
  `index.ts` (migrations, base, `ApiServer`, Discord). Le socle Discord vient d'Aphrody :
  `@aphrody/discord-kit` (intents, cache, interactions, commandes, gardes `NotBot` et
  mono-guilde, arrêt propre, binaire compilé, REST `discordFetch`, aussi sous
  `scripts/lib/discord-rest.ts`) et `@aphrody/messaging` (texte et DM hors gateway) ; les
  gardes métier (owner, staff, salon, permissions) restent dans `src/guards/`.
- **Binaire autonome** (`apps/server`) : un `Bun.serve` frontal sert, dans cet ordre,
  `/api/local/*` (`bun:ffi` vers `libshenron_ffi` ; `health` rapporte les `groups` de
  l'API, type `LocalHealthResponse` du contrat), l'hôte `@aphrody/shenron-api/host` (`/api/v1/*`
  toujours, `/api/public/*` et `/mcp` quand il les sert, WebSocket du chat), les assets
  statiques puis `/assets/*` du VFS, et relaie le reste vers le `server.js` standalone de
  Next lancé en processus enfant. `src/backend.ts` câble l'hôte depuis `SHENRON_HOME` et
  le payload (VFS public, conversations SQLite, agent home, OCR `aphrody`, sidecar
  `shenron-mcp` voisin, chat sur un modèle local déclaré) ; une capacité absente désactive
  son groupe sans arrêter le serveur. `SHENRON_HOME` contient
  `config/shenron.env` (refusé s'il n'est pas en 600) ; profil `production` dès que
  `DATABASE_URL` est posé, sinon URLs publiques de dragonballfr.com. Le build compile le site
  sans base, aplatit `node_modules/.bun`, échoue sur toute donnée privée, emballe un payload
  zstd (site, bibliothèque native, VFS public gardé, modèle de l'agent home) dans
  `bun build --compile`. `/api/local/koharu` relaie l'éditeur d'un navigateur local vers un
  enfant `koharu-sdk` (groupe `koharu` de `health`, jamais en production).
- **Application de bureau** : **Shenron Studio** (`crates/shenron-desktop`, Tauri 3) est le
  seul binaire graphique, un identifiant, un dossier de données (`SHENRON_HOME`), un installeur
  (`scripts/build/desktop.ts`). Elle lance `shenron-server` en sidecar (avec `shenron-mcp` et
  `koharu-sdk` à côté) et ouvre `/desktop` ; le moteur de l'éditeur (`koharu-library`,
  propriétaire unique de l'état) tourne dans son processus derrière `koharu-app`, simple
  bibliothèque de commandes Specta (`docs/products/koharu/README.md`).
- **Natif** : `@aphrody/shenron-native` (`bun:ffi` vers `crates/shenron-ffi`, `SHENRON_FFI_LIB`) ;
  `@aphrody/shenron-koharu/protocol` parle au moteur par son transport (`src/transport.ts`) : Tauri
  IPC dans Shenron Studio, le pont `/api/local/koharu` ailleurs ; `./native` pilote
  `koharu-sdk` (JSON Lines sur stdio) pour `@aphrody/shenron-pipeline`.
  Les globals Tauri se lisent par `globalThis.__TAURI_INTERNALS__`.
- **Chaîne éditoriale** : `bun run --filter @aphrody/shenron-pipeline pipeline <ocr|rag|ia|translation|crawl|unify>`
  délègue le calcul à Aphrody.

## Portes et invariants

- `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test`, `bun run lint` ; Rust :
  `bun run clippy:rust`, `bun run test:rust`. La CI GitHub : `ci.yml` pour Bun, `rust.yml` pour
  Rust (actif avec le secret `APHRODY_GIT_TOKEN`).
- Les suites `*.live.test.ts` (et `describe.if(isLive())` de `@aphrody/shenron-pipeline/testing/live-rag`) exigent les services réels.
- Manga, scans et déclarations d'Akira Toriyama priment ; Fandom est interdit comme source.
  Aucune écriture OCR/traduction pendant un gel des databooks ; `rag:build` jamais au premier
  plan ni sur le bot de production.
- Accueil et shell du site : logo style DB Super, nuage Kinto'un et vidéos par section restent ; admin séparé du public ; nouvelles puis mini-jeux en bas ; rien de visible ne se supprime sans accord (`docs/products/accueil-et-shell.md`).
- Données privées (bases, corpus, identifiants, `data/home/`, `.env`) : jamais dans Git ni
  dans un artefact public ; le build public passe une garde (`scripts/build/server.ts`).
