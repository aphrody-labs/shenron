<!-- SPDX-License-Identifier: Apache-2.0 -->
# L'éditeur de traduction manga de Shenron Studio (moteur Koharu)

L'éditeur de traduction de manga de Shenron Studio (projets, scènes, détection, OCR,
traduction, nettoyage, lettrage, export) tourne sur le moteur Koharu, absorbé dans ce dépôt :
« Koharu » reste le nom de code des crates `koharu-*` et du paquet `@shenron/koharu`, jamais
un produit visible. Référence unique pour son emplacement, son interface et sa frontière
éditoriale. Documentation amont de koharu-rs (Mintlify, en/ja/zh), archivée telle quelle et
non maintenue : [`docs/reference/koharu/upstream/`](../../reference/koharu/upstream/) ; journal
amont : [`CHANGELOG.md`](../../reference/koharu/upstream/CHANGELOG.md) ; licences
MIT/Apache-2.0 d'origine : [`docs/licenses/koharu/`](../../licenses/koharu/).

## Une application, un moteur

**Shenron Studio** (`crates/shenron-desktop`, Tauri 3, identifiant `com.dragonballfr.shenron`)
est la seule application de bureau et le seul binaire graphique. Elle lance le sidecar
`shenron-server` (`apps/server`) et ouvre le site dans sa fenêtre : éditeur, studio, page
d'accueil `/desktop` et pilotage `/desktop/control`. Le moteur de l'éditeur tourne **dans son processus** :
`koharu-app` n'est qu'une bibliothèque de commandes Tauri (Specta), sans binaire ni
`tauri::Builder` propre, et `shenron-desktop` les enregistre sous leurs noms d'origine
(`koharu_app::COMMAND_NAMES`) à côté des commandes du studio (`crates/shenron-studio` :
`studio_*`, `shenron_chat`). Aucun pont inter-processus pour la fenêtre de l'application.

`koharu-library` est l'unique propriétaire du moteur : `koharu_library::Editor` détient le
projet ouvert, la présentation du canevas, les travaux du pipeline, l'agent et les réglages ;
`koharu-app` (Tauri), `koharu-sdk` (JSON Lines) et `koharu_library::Service` (méthodes sans
interface) n'en sont que des liaisons fines. La télémétrie amont (`koharu-metrics`) est
retirée ; les durées d'étapes et de pipeline restent des événements `tracing` locaux.

| Surface | Chemin |
| --- | --- |
| Moteur | `koharu-library` : `editor` (état de l'éditeur, commandes par nom), `service` (méthodes `project.*`, `page.*`…), `home` (racines), `Library`/`Document` (scanlation par lots), sur les crates `crates/koharu-*` (`pipeline`, `ml`, `translator`, `scene`, `storage`, `renderer`, `rasterizer`, `psd`, `canvas`, `agent`, `secrets`, `desktop`) |
| Commandes Tauri | `koharu-app` : bibliothèque, générateur du protocole en exemple (`examples/protocol.rs`) |
| Application | `shenron-desktop` (« Shenron Studio »), fonctionnalité `koharu` par défaut |
| Socle ML | `koharu-{llama,torch,diffusion,runtime,config}`, fournis par Aphrody (voir [`APHRODY-ECOSYSTEM.md`](../../architecture/APHRODY-ECOSYSTEM.md)) |
| Client Bun | `@shenron/koharu` (`packages/koharu`) : `./protocol` (généré, transport `src/transport.ts`), `./native` (`koharu-sdk` pour `@shenron/pipeline`), `./canvas` (WASM de `koharu-canvas`) |
| Interface | `@shenron/ui/koharu`, montée par le site sous `/studio` (onglet de l'espace Bibliothèque) |

## Où l'éditeur s'ouvre

`apps/site/src/app/studio/StudioEditor.tsx` monte l'éditeur partout où son moteur est local :

- **dans Shenron Studio** : le transport du protocole (`packages/koharu/src/transport.ts`)
  parle Tauri IPC au moteur du processus ;
- **dans un navigateur sur un site servi par `shenron-server`** (par exemple
  `http://127.0.0.1:<port>/studio`), quand `GET /api/local/health` annonce le groupe
  `koharu` : le transport parle au pont `/api/local/koharu` du serveur
  (`apps/server/src/koharu.ts`), qui relaie vers un processus enfant `koharu-sdk` démarré au
  premier usage (`POST /api/local/koharu/invoke`, `{ command, args }` avec l'en-tête
  `x-koharu-session` ; valeurs des canaux en événements serveur sur
  `GET /api/local/koharu/events?session=<id>` ; résultats binaires en `application/octet-stream`).
  Le pont ne répond qu'à la machine locale (pair et hôte de bouclage, même origine) et jamais
  en profil `production` ;
- **sur dragonballfr.com** : aucun moteur local, la présentation reste.

`koharu-sdk` est un exécutable de `koharu-library` (JSON Lines sur stdin/stdout). Il répond
aux commandes de l'éditeur (`{ id, command, args }`, mêmes noms et arguments que le protocole,
canaux `{ channel, message }`) et aux méthodes de `@shenron/koharu/native` (`{ id, method,
params }`, listées dans `crates/koharu-library/README.md`) sur le même moteur. Il est livré à
côté de `shenron-server` et `shenron-mcp` par l'installeur (`scripts/build/desktop.ts`,
compilé avec la fonctionnalité `desktop` : sélecteurs de fichiers natifs, page de connexion
Codex ouverte localement) ; `shenron-server` le trouve à côté de lui (`./`, `./binaries/`)
ou par `SHENRON_KOHARU_SDK_BIN`.

## Données

Projets et modèles vivent sous `SHENRON_HOME` (`crates/koharu-library/src/home.rs`, même
convention que `apps/server/src/config.ts` ; Shenron Studio y passe son dossier de données) :

| Données | Chemin | Ancien emplacement, encore lu |
| --- | --- | --- |
| Projets | `$SHENRON_HOME/data/koharu/projects/<nom>.khrproj` | `Documents/Koharu` : ses projets restent listés et s'ouvrent sur place ; les nouveaux vont sous `SHENRON_HOME` |
| Modèles et bibliothèques d'exécution | `$SHENRON_HOME/cache/koharu/packages` | `<cache OS>/koharu/packages`, réutilisé tant que le nouveau magasin n'existe pas |
| Réglages | `~/.koharu/config.toml` (inchangé : `koharu-config`, fourni par Aphrody, n'offre pas d'autre emplacement) | |
| Identifiants | trousseau du système (`koharu-secrets`) | |

`koharu-sdk --root <dossier>` garde une collection de projets explicite (sans ancien
emplacement), comme le fait `@shenron/pipeline`.

## Agent de l'éditeur

L'agent (`crates/koharu-agent`, Codex) agit sur le projet ouvert par les outils de
`koharu_library::agent_tools`. Le point d'extension `koharu_agent::Toolbox` lui ajoute les
connaissances de Shenron (`koharu_library::editor::knowledge`) :

- `lookup_lexicon` : lexique canonique japonais → français (`data/lexique-db-canonique.json`
  embarqué, `SHENRON_LEXIQUE` le remplace) ;
- `search_dragon_ball` : corpus local de Shenron (wiki, référence canon, databooks, manga) par
  `GET /api/local/rag/search` du serveur local (Shenron Studio : son sidecar ; `koharu-sdk` :
  `--shenron-url`, posé par `shenron-server`).

```sh
cargo build -p koharu-library --bin koharu-sdk [--features desktop]
bun --filter @shenron/koharu protocol      # régénère packages/koharu/src/protocol.ts (Specta)
bun --filter @shenron/koharu build:wasm    # reconstruit koharu-canvas
```

Les fichiers générés (protocole, WASM) ne s'éditent jamais à la main. Le générateur
écrit `packages/koharu/src/protocol.ts` relativement à la racine du dépôt quel que soit le
répertoire courant ; `KOHARU_PROTOCOL_OUT` le redirige (chemin relatif à la racine). Un test
de `koharu-app` garde égales la liste des commandes Tauri et celle de
`koharu_library::editor::dispatch`.

## Retiré

Ces surfaces n'avaient aucun appelant ou doublaient le moteur, et ont été supprimées le
2026-10-05 :

- le second broker `koharu_rpc`/`koharu_rpc_batch` (`crates/shenron-studio/src/koharu.rs`),
  qui tenait son propre projet ; l'export vers Shenron passe par les commandes
  `get_pages`, `get_page_result` et `get_page_source_sha256` ;
- `koharu-metrics` (télémétrie amont) et l'hôte d'agent sans interface
  (`koharu_library::agent_host`), remplacés par l'éditeur unique ;
- `@shenron/koharu` racine, `./tauri`, `./settings` et `./media` (client générique,
  adaptateur Tauri, contrat de réglages JSON Lines, réexport de `@shenron/media`) ;
- `MangaStudio` et `KoharuSettings` du studio, doublons de `/koharu` et de
  `SettingsPage`, ainsi que `KoharuSettings` des préférences et `Updater` de
  l'éditeur (jamais montés) ;
- l'ancien chemin `packages/koharu-bridge/` du générateur.

## Candidats vers Shenron

Une sortie Koharu ou de l'OCR Aphrody n'entre dans Shenron que comme
**candidat non arbitré**, lié par empreintes au manifeste Shenron :

```sh
bun run --filter @shenron/pipeline pipeline koharu-candidate <manifeste-manga.json> <résultats.jsonl> <candidats.jsonl>
bun run --filter @shenron/pipeline pipeline koharu-databook-candidate <manifeste-haché.json> <résultats.jsonl> <candidats.jsonl>
bun run --filter @shenron/pipeline pipeline koharu-native-candidate <manga|databook> <manifeste.json> <racine-projets> <projet> <candidats.jsonl> [--sdk <koharu-sdk>]
bun run --filter @shenron/pipeline pipeline aphrody-ocr-candidate <manga|databook> <manifeste-haché.json> <ocr-v2.jsonl> <candidats.jsonl>
```

- L'adaptateur exige que l'empreinte SHA-256 de l'image traitée corresponde à
  une entrée unique du manifeste ; il refuse les pages inconnues, dupliquées ou
  aux empreintes divergentes. Les manifestes databooks sans empreinte sont
  refusés : régénérer l'export.
- Le candidat garde géométrie, textes, confiances et provenance par étape ; sa
  décision reste `unreviewed`.

## Frontière éditoriale

- PostgreSQL, les scans sources, le lexique japonais canonique, les juges, la
  quarantaine OCR, les révisions et la publication restent l'autorité Shenron.
- Aucun adaptateur n'écrit en base ni ne pose de verdict. Un candidat manga ne
  sert que d'indice dans le paquet de relecture visuelle hors ligne ; la
  relecture de l'image et l'audit de couverture restent obligatoires.
- Un run Koharu ne lève pas une quarantaine databooks, ne marque pas une
  traduction comme acceptée et ne change pas le canon. Une traduction fluide
  n'est pas une acceptation éditoriale ([`TRADUCTION-DATABOOKS.md`](../../guides/TRADUCTION-DATABOOKS.md)).
- Les révisions de scène, l'annulation et le stockage de projet appartiennent à
  Koharu ; ils ne remplacent pas `wiki_revisions`.

## Règles de travail sur les crates

- Garder les API sûres séparées du FFI, du chargement dynamique et de
  l'intégration de build. Quand un contrat change, migrer tous ses consommateurs
  du dépôt et retirer l'ancienne forme, sans alias de compatibilité.
- Portages de modèles : conserver la structure, les noms et l'ordre
  d'exécution amont, documenter toute divergence ; examiner un écart de poids
  avant de toucher au chargeur. Convertir le device une seule fois à la
  frontière du modèle, réutiliser les runtimes, désactiver les gradients en
  inférence.
- Mesures : entrées identiques et sorties structurées comparées ; chauffer les
  modèles hors des régions mesurées ; rapporter device, entrée, référence et
  écarts.
- Poids, jeux de données, identifiants et sorties locales restent hors de Git.
- Le travail de scène et d'export durable reste natif ; l'interaction
  transitoire du canvas reste dans le navigateur (WASM/WebGPU).
