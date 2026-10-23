# Carte mémoire factuelle — Shenron

État relevé le 2026-10-20 dans le checkout local. Générée après `graphify update .`.
Cette carte sert à orienter Codex ; elle ne remplace ni le code ni les documents
de référence. Les faits susceptibles d’évoluer sont explicitement datés.

## Identité et stack

- Dépôt monorepo privé Bun/Rust nommé `@aphrody/shenron`, package manager
  déclaré `bun@1.4.4`. Les dépendances JavaScript tierces sont centralisées
  dans le catalogue `workspaces.catalog` du `package.json` racine.
- Interface : `apps/site`, Next 16 App Router. Bot Discord : `apps/bot`.
  Serveur autonome : `apps/server`, Bun. Studio manga : application Tauri 3
  `crates/shenron-desktop`, avec moteur dans les crates `koharu-*`.
- Bibliothèques TypeScript partagées : `packages/*`. Pipeline : paquet unique
  `@aphrody/shenron-pipeline` sous `packages/pipeline`; ses sous-chemins
  `ai/*`, `aphrody/*` et `bxc` sont des modules, pas des paquets séparés.
- Serveur MCP Shenron : crate Rust `crates/shenron-mcp`, binaire
  `shenron-mcp`. Site public : `https://dragonballfr.com/mcp`. Le connecteur
  Codex du projet s’appelle `shenron` et vit dans `.codex/config.toml`.
  Cette adresse est publiquement en lecture seule quand aucun credential
  d’élévation valide n’est fourni.
- L’état de production, les secrets, l’Infra, les hôtes et leur configuration
  ne sont pas inférés du code local ; l’exploitation appartient à
  `aphrody-infra`.

## Flux de données et frontières

- PostgreSQL est la source éditoriale principale ; le SQLite du bot est un
  réplica. Redis porte des projections reconstructibles. Voir
  `packages/db/src/schema.ts`, `bot-schema.ts` et
  `docs/architecture/STACK.md`.
- `@aphrody/shenron-api/contract` définit les contrats API ; l’hôte Bun est
  `@aphrody/shenron-api/host`. Le site monte l’API publique sous
  `apps/site/src/app/api/public/[...route]`.
- Le serveur autonome sert les API locales, l’hôte API, les assets/VFS et
  relaie le reste au serveur Next standalone. Détails maintenus dans
  `docs/architecture/RUNTIME.md`.
- Les capacités lourdes ML, OCR, traduction et certains runtimes proviennent
  d’Aphrody et sont consommées derrière des frontières de paquets/processus.
  L’Infra (déploiement, systemd, nginx, sauvegardes, migrations de production)
  est hors du propriétaire de ce dépôt.
- Graphe de dépendances autorisé et rôles : `docs/architecture/STACK.md`,
  sections 3–4 ; les règles d’exécution sont décrites dans
  `docs/architecture/RUNTIME.md`.

## Langues et interfaces

- Toute réponse à l’utilisateur et documentation du dépôt : français. Les
  identifiants, commentaires nouveaux, API, routes et noms d’outils : anglais.
- Le site fournit ses dictionnaires dans
  `apps/site/messages/{fr,en,ja}.json`. Le français est la référence ; les
  locales anglaise et japonaise doivent rester complètes.
- Le lexique Dragon Ball partagé est dans `packages/lexicon`.
- « Shenron Studio » est le nom public du produit ; Koharu est un nom de code
  interne.

## MCP Shenron et authentification

- Le MCP est servi par `crates/shenron-mcp`; le site relaie `/mcp` vers le
  processus HTTP configuré par `SHENRON_MCP_URL`. Le serveur autonome peut
  lancer un sidecar `shenron-mcp --http ... --public`.
- Sans élévation, le MCP expose les outils publics en lecture. Les outils
  d’écriture/admin exigent un Bearer accepté ou une IP cliente explicitement
  autorisée : `SHENRON_MCP_TOKENS`, `SHENRON_API_ADMIN_TOKEN`,
  `DBFR_TOKEN` et `SHENRON_MCP_ALLOWED_IPS` sont documentés dans
  `docs/operations/ENV.md`.
- `SHENRON_ADMIN_TOKEN` protège d’autres API Shenron et n’est pas, à lui
  seul, une preuve de credential MCP valide. Ne jamais afficher ni commiter les
  valeurs .env. Tester l’authentification avec une requête MCP avant de
  qualifier un connecteur d’admin.
- Les MCP Aphrody sont des services distincts. Ne pas les substituer au MCP
  Shenron, et ne pas confondre ce dépôt ou ses consignes avec le plugin Claude
  Code.

## Commandes confirmées par les manifestes au 2026-10-20

- Installer les dépendances : `bun install --frozen-lockfile`.
- Qualité JS : `bun run typecheck`, `bun run lint`, `bun run test`,
  `bun run format:check`.
- Rust : `bun run check:rust`, `bun run clippy:rust`,
  `bun run test:rust`. Référence détaillée :
  `docs/development/rust.md`.
- Build site/serveur et bot : `bun run build` (scripts définis à la racine).
- Contrôles générés : OpenAPI via
  `bun packages/api/scripts/openapi.ts --check`, jetons UI via
  `bun packages/ui/scripts/generate-tokens.ts --check`, contrats pipeline via
  `bun packages/pipeline/scripts/ai/check-contracts.ts`.

## Navigation rapide

- Architecture : `docs/architecture/STACK.md`,
  `docs/architecture/RUNTIME.md`, `docs/architecture/i18n.md`.
- Variables d’environnement : `docs/operations/ENV.md`. Les .env sont
  privés ; ne jamais les imprimer ou commiter.
- Index documentaire : `docs/README.md`.
- Plan et invariants éditoriaux : `docs/reference/root/PLAN.md`.
- État de reprise daté : `docs/reference/root/REPRISE.md`, à traiter comme
  historique de travail et non comme une extension automatique de la demande.
- Crate MCP : `crates/shenron-mcp`; MCP web/proxy : rechercher les routes
  `/mcp` sous `apps/site` et `apps/server`.

## Carte Graphify

Graphe local construit par `graphify update .` le 2026-10-20 depuis le commit
`8a9f838d` : 81,186 nœuds, 185,053 liens, 2,472 communautés, 6,031 fichiers
parcourus. Fichiers dans `graphify-out/` (ignorés par Git), en particulier
`graph.json`, `GRAPH_REPORT.md` et `graph.html`. Rafraîchir avec
`graphify update .`; utiliser `graphify query`, `explain`, `path`,
`affected` ou `god-nodes` pour naviguer.

Limites observées à la génération : dépendances Tree-sitter SQL et HCL absentes ;
quelques fichiers à erreurs de syntaxe ; environ 534 fichiers sans symboles
extraits ; `vendor/mediabunny` est inclus, donc le graphe ne représente pas
uniquement le code Shenron. Le rapport indique le commit source ; vérifier son
actualité avec `git rev-parse HEAD`. Le code, les manifests et les docs
maintenues restent la preuve pour toute affirmation factuelle.
+
## État des objectifs et des commits (lecture du 2026-10-20)

Sources croisées : `GOAL.md`, `TODO.md`, dernières sections de
`docs/reference/root/PLAN.md`, `docs/reference/root/REPRISE.md` et commits
jusqu’à `8a9f838d`. Les fichiers GOAL/TODO/PLAN/REPRISE sont des instantanés
datés et présentent des décalages ; confirmer l’état dans le code et les commits
avant de reprendre un item.

### Éléments récents livrés dans Git

- Les commits du 19–20 octobre terminent les clarifications DBXV2 sur les droits,
  le périmètre public et la faisabilité WASM, et allongent à 30 s le test de
  parcours de fichiers Windows.
- Finitions de l’accueil, des fiches manga, de l’admin databooks/transcription,
  navigation des profils wiki et comportements Studio ont aussi été commitées.
- Le bloc de reprise du 19 octobre documente Studio web/bureau/mobile, le cadre
  admin, le moteur hébergé, le lecteur Beerus, la timeline/GIF et les gates
  locales ; il précise toutefois que certains contrôles de production/authentifiés
  et la compilation/smoke du moteur restent à confirmer. Ces détails sont un
  relevé daté, pas une preuve de l’état actif aujourd’hui.

### Périmètre actif indiqué par les fichiers directeurs

- `GOAL.md` conserve des objectifs très larges : Studio, complétude manga/SOSH
  et wiki, complétude des 110 volumes, workers manga persistants, RAG/chat,
  pages manga/databooks, catalogues de jeux et workflows CI.
- `TODO.md` reprend ces chantiers et exige des preuves séparées pour les
  médias réels, les writers, les tests navigateur, l’image scellée et le
  comportement après activation. Plusieurs éléments sont dépassés ou recoupent
  des lots récents déjà commis.
- `PLAN.md` décrit plus précisément Studio et Beerus, mais certains chapitres
  datent d’avant les commits les plus récents. `REPRISE.md` est volumineux,
  chronologique et se termine par un point de situation du 19 octobre, pas par
  les commits du 20 octobre.
- Ne pas reprendre un item ancien automatiquement. Choisir selon la demande
  utilisateur courante ; rafraîchir les reçus, l’image active et les preuves
  réseau avant de déclarer une livraison.

### Commits les plus récents observés

`8a9f838d` DBXV2 droits/périmètre ; `0f3b0833` faisabilité WASM DBXV2 ;
`1557013d` délai de test Windows ; `48217092` cartes manga ;
`66e87442` admin databooks/transcription. Liste consultable avec
`git log -n 20 --date=short --pretty=format:"%h %ad %s"`.



