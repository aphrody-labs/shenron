<!-- SPDX-License-Identifier: Apache-2.0 -->

# Développement Rust

Le workspace Cargo du dépôt (`Cargo.toml` racine, membres `crates/*`) porte la CLI `shenron`,
le serveur MCP, l'ABI C lue par Bun, l'application de bureau et le moteur de Shenron Studio
(nom de code Koharu, crates `koharu-*`). Ce document en est la référence : carte des crates,
commandes, dépendances Aphrody, règles WSL, conventions et ajout d'une crate. Le code fait foi.

## Démarrer

- **Toolchain** : `rust-toolchain.toml` épingle Rust 1.98.1 (rustfmt, clippy) et trois cibles :
  `x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc` (bureau, compilé depuis Linux par
  `cargo-xwin`) et `wasm32-unknown-unknown` (`koharu-canvas`). `rustup` l'installe au premier
  `cargo` ; MSRV des crates : `rust-version = "1.97"`, édition 2024.
- **Outils** (tous en Rust) : `cargo install --locked just cargo-nextest cargo-deny`, puis selon
  le besoin `sccache`, `cargo-xwin` (installeur Windows) ; `wasm-bindgen-cli` est installé à la
  version de `Cargo.lock` par `bun --filter @shenron/koharu build:wasm`.
- **Bibliothèques système (Linux)** : celles du runtime Tauri 3 CEF (GTK 4, X11, xkbcommon), `libclang` (bindgen des crates `koharu-*-sys` d'Aphrody), fontconfig, D-Bus,
  OpenSSL, `cmake`, `pkg-config`. La liste exacte est l'étape « System libraries » de
  `.github/workflows/rust.yml`.
- **Accès à Aphrody** : `aphrody-labs/aphrody` est privé. `.cargo/config.toml` fait passer Cargo
  par le CLI git (`net.git-fetch-with-cli`) : la réécriture SSH (`url.<base>.insteadOf`) ou
  l'assistant d'identifiants configuré pour GitHub suffit.
- Premier tour : `just` (liste des tâches), `just rust-check`, `just rust-test`.

## Carte des crates

Deux familles : les crates Shenron (Apache-2.0, `aphrody-dev`) et les crates amont de Koharu,
intégrées et modifiées ici, qui gardent leur licence `MIT OR Apache-2.0` et l'attribution de leurs
auteurs (`docs/licenses/koharu/`). Le socle ML (`aphrody-{llama,torch,diffusion,ml-runtime,ml-config}`),
le RAG, l'OCR, les modèles et le fork Tauri 3 (`aphrody-tauri*`, `tauri-specta`) viennent
d'Aphrody : on les consomme, on ne les copie pas.

| Crate               | Rôle                                                                                                                      | Features                                  | Cibles                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------- |
| `shenron-rag`       | Corpus Dragon Ball hors ligne, index local, persona, ingestion dans le stockage `aphrody-rag`                             | —                                         | natif                 |
| `shenron-manga`     | Adaptateur Shenron sur `koharu-library` : catalogue CDN, résultats de page, projection OCR                                | `koharu` (désactivée par défaut)          | natif                 |
| `shenron-cli`       | Binaire `shenron` : santé, RAG, entraînement, pont OCR des databooks, API databooks, manga, configuration                 | `ocr` (défaut), `koharu`                  | natif                 |
| `shenron-mcp`       | Serveur MCP (stdio, HTTP `--http --public`) : outils `dragonball.*` et `dbfr_*`                                           | `koharu`                                  | natif                 |
| `shenron-ffi`       | ABI C `shenron_*` (`cdylib` + `rlib`) chargée par `@shenron/native` (`bun:ffi`)                                           | —                                         | natif (`.so`, `.dll`) |
| `shenron-studio`    | Commandes Tauri du studio : santé, RAG, corpus, modèles locaux, moteur Koharu en processus                                | —                                         | natif                 |
| `shenron-desktop`   | Application Tauri 3 : le site, l'éditeur et le studio dans une fenêtre, `shenron-server` en sidecar                       | `koharu` (défaut), `custom-protocol`      | Windows (NSIS), Linux |
| `koharu-library`    | Moteur sans interface : projets, édition, traitement, rendu, outils d'agent ; binaire `koharu-sdk` (JSON Lines sur stdio) | —                                         | natif                 |
| `koharu-app`        | Couche Tauri de l'éditeur ; ses commandes Specta génèrent `packages/koharu/src/protocol.ts`                               | —                                         | natif                 |
| `koharu-canvas`     | Viewport WebGPU de l'éditeur, compilé en WASM (`cdylib`) ; le code vit sous `cfg(target_arch = "wasm32")`                 | —                                         | wasm32                |
| `koharu-rasterizer` | Trames préparées portables, composition Vello/WGPU                                                                        | `native` (défaut ; sans elle pour wasm32) | natif, wasm32         |
| `koharu-renderer`   | Rendu d'une page : mise en page, shaping, césure, polices                                                                 | —                                         | natif                 |
| `koharu-scene`      | Modèle de scène typé                                                                                                      | —                                         | natif                 |
| `koharu-storage`    | Instantanés et blobs sur le système de fichiers                                                                           | —                                         | natif                 |
| `koharu-pipeline`   | Orchestration des modèles en processus (détection, OCR, inpainting)                                                       | —                                         | natif                 |
| `koharu-ml`         | Modèles (détection, OCR, masques, polices, LLM) sur le socle ML d'Aphrody                                                 | —                                         | natif                 |
| `koharu-translator` | Traducteurs locaux et distants, glossaire                                                                                 | —                                         | natif                 |
| `koharu-psd`        | Export PSD depuis les révisions de scène                                                                                  | —                                         | natif                 |
| `koharu-desktop`    | Préparation native des pages, partagée par la présentation et l'export                                                    | —                                         | natif                 |
| `koharu-agent`      | Agent Codex en processus (OAuth)                                                                                          | —                                         | natif                 |
| `koharu-secrets`    | Secrets dans le trousseau du système                                                                                      | —                                         | natif                 |

`bun scripts/build/rust/test.ts --list` donne la liste réelle des membres (`cargo metadata`).
Les cibles natives sont Linux x64 et Windows x64 ; les binaires livrés (`shenron`,
`shenron-mcp`, `shenron-desktop`, `libshenron_ffi`) sont décrits dans
[`architecture/RUNTIME.md`](../architecture/RUNTIME.md).

## Commandes

`just` est le point d'entrée unique (Bun et Rust) ; ses recettes appellent les scripts existants.
Les alias Cargo vivent dans `.cargo/config.toml`, les scripts `*:rust` dans `package.json`.

| Tâche                              | `just`                                               | Cargo                                        | `bun run`                              |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| Vérifier les types (toutes cibles) | `just rust-check`                                    | `cargo ck`                                   | `check:rust`                           |
| Clippy, avertissements refusés     | `just rust-lint`                                     | `cargo lint`                                 | `clippy:rust`                          |
| Tests (nextest)                    | `just rust-test [args]`                              | `cargo t`                                    | `test:rust`                            |
| Format                             | `just rust-fmt`, `just rust-fmt-check`               | `cargo fmt --all [--check]`                  | `fmt:rust` (vérifie)                   |
| Licences, avis, sources            | `just rust-deny`                                     | `cargo deny check`                           | `deny:rust`                            |
| Feature `koharu` (clippy + tests)  | `just koharu`                                        | `cargo koharu`, `cargo koharu-test`          | —                                      |
| `koharu-canvas` en wasm32          | `just wasm` (vérifie), `just wasm-build` (construit) | `cargo wasm`                                 | `--filter @shenron/koharu build:wasm`  |
| Rustdoc du workspace               | `just rust-doc`                                      | `cargo docs`                                 | —                                      |
| Protocole Specta                   | `just protocol`                                      | —                                            | `--filter @shenron/koharu protocol`    |
| Serveur MCP, CLI                   | `just mcp [args]`, `just cli [args]`                 | `cargo run -p shenron-mcp`, `-p shenron-cli` | —                                      |
| Installeur de bureau               | `just desktop [--target …]`                          | —                                            | `scripts/build/desktop.ts`             |
| Bloc de dépendances généré         | `just deps`, `just deps-check`                       | —                                            | `scripts/build/rust/workspace-deps.ts` |
| Manifestes alignés                 | `just align-check`                                   | —                                            | `scripts/build/rust/align-crates.ts`   |
| Tout ce que fait la CI             | `just ci`                                            | —                                            | —                                      |

`just check`, `just lint`, `just test` et `just format-check` enchaînent le côté Bun puis le côté
Rust. Les alias Clippy finissent par `-- -D warnings` : pour cibler une crate, écrire la commande
longue (`cargo clippy -p shenron-rag --all-targets -- -D warnings`). `bun run test:rust` dérive la
liste des crates de `cargo metadata`, passe par nextest quand il est installé (sinon
`cargo test`) et transmet ses arguments (`bun run test:rust --profile ci`).

**nextest** (`.config/nextest.toml`) : profil `default` (6 processus, aucun nouvel essai, test
lent signalé à 30 s et tué à 2 min) et profil `ci` (un processus par CPU, deux nouveaux essais,
rapport JUnit dans `target/nextest/ci/junit.xml`). Le filtre par défaut écarte les tests
d'intégration wgpu de `koharu-rasterizer` et `koharu-renderer` (adaptateur GPU requis) et les
tests du détecteur de polices de `koharu-ml` (téléchargent LibTorch/CUDA) :
`cargo t --ignore-default-filter` les lance sur une machine équipée, `cargo t --run-ignored all`
lance aussi les `#[ignore]`.

**rust-analyzer** (`rust-analyzer.toml`) : Clippy à l'enregistrement, feature `koharu` analysée,
dossier cible propre (`target/rust-analyzer`, l'éditeur ne bloque jamais `cargo`), sorties Bun et
Next exclues.

## Dépendances Aphrody

- `[workspace.dependencies]` contient une section écrite à la main (dépendances propres à
  Shenron) puis un bloc généré par `bun scripts/build/rust/workspace-deps.ts` : les crates du
  dépôt en `path`, celles d'Aphrody en `git` à la révision `# aphrody-rev:`, le reste copié du
  workspace d'Aphrody (mêmes versions, mêmes features). Monter la révision :
  `just deps --rev <sha>`, puis `just rust-check`. La CI vérifie le bloc (`--check`).
- Le script lit `Cargo.toml` d'Aphrody à cette révision dans `--aphrody <dépôt>`, sinon
  `~/aphrody`, sinon la base git que Cargo a remplie (`$CARGO_HOME/git/db/aphrody-*`).
- `[patch.crates-io]` épingle `hf-hub` à la révision qu'attend `aphrody-models`.
- **Compiler contre un checkout local d'Aphrody** (travail non commité compris) :
  `just aphrody-local [~/aphrody]` écrit `.cargo/local.toml` (ignoré par Git, inclus par
  `.cargo/config.toml`) qui remplace chaque dépendance git d'Aphrody par son chemin local ;
  `just aphrody-pinned` revient à la révision épinglée. `.cargo/local.toml` reçoit aussi tout
  réglage personnel ; `.cargo/config.toml`, suivi par Git, ne porte rien de propre à une machine.
  Un ancien `.cargo/config.toml` généré (avant son suivi par Git) se supprime avant de tirer.

## WSL et machines Aphrody

- `~/aphrody/scripts/build/rust/cargo-serial.sh` sérialise les compilations entre agents et
  terminaux (verrou, `APHRODY_CARGO_JOBS` ≤ 6, sccache). Exporter
  `APHRODY_CARGO_SERIAL=~/aphrody/scripts/build/rust/cargo-serial.sh` : `bun run *:rust`, `just`
  et le runner de `cargo tauri build` (`scripts/build/rust/cargo-runner.ts`) passent alors par lui
  (`scripts/build/rust/cargo.ts`).
- Sous WSL, ce wrapper refuse les commandes lourdes (build, test, clippy…). Le Rust lourd de
  Shenron passe par le tunnel Cargo d'Aphrody (`vps-cargo.ts run --repo shenron`, dans
  `~/aphrody/scripts/build/rust/`), qui compile l'arbre de travail exact sur les deux VPS de
  build déclarés dans `~/aphrody/config/host/vps-cargo.json`. Le runner de `cargo tauri build`
  (`scripts/build/rust/cargo-runner.ts`) choisit le dépôt du tunnel qui correspond à l'arbre
  de travail. Répartir les jobs indépendants sur les deux hôtes (une cible par hôte). Le second
  hôte porte la base de production : ses builds tournent sous cgroup (`MemoryMax=7G`,
  `CPUQuota=450%`), sans accès GitHub (les dépendances git d'Aphrody passent par le tunnel).
  WSL ne fait que le Bun (installation, tests, typecheck, `build:server`).
  `APHRODY_LOCAL_CARGO=1` force une compilation locale, réservée aux crates légères à cache
  chaud.
- sccache reste un réglage local (`RUSTC_WRAPPER=sccache` ou `build.rustc-wrapper` dans
  `~/.cargo/config.toml`), comme le nombre de jobs (`CARGO_BUILD_JOBS`).
- nextest se limite à 6 processus par défaut (`-j` ou `NEXTEST_TEST_THREADS` pour changer).

## Conventions

- **Langue** : code, identifiants, commentaires et messages d'erreur en anglais ; aucun texte
  d'interface codé en dur (dictionnaires, voir `AGENTS.md`). En-tête SPDX dans chaque fichier :
  `Apache-2.0` pour Shenron, `MIT OR Apache-2.0` dans les crates `koharu-*`.
- **Manifestes** : chaque crate hérite `version`, `edition`, `rust-version` et `[lints]` du
  workspace ; les crates Shenron héritent aussi licence, auteurs, page d'accueil et dépôt.
  Toute dépendance passe par `{ workspace = true }`. Contrôle : `just align-check`.
- **Lints** : niveaux dans `[workspace.lints]` (Cargo.toml), seuils et tolérances de test dans
  `clippy.toml` ; la CI refuse tout avertissement. Un nouvel `#[allow(…)]` porte sa raison
  (`#[allow(clippy::too_many_arguments, reason = "…")]`) et reste au plus près du code visé.
- **Format** : `rustfmt.toml` (largeur 100, `use_small_heuristics = "Max"`).
- **Erreurs** : une bibliothèque expose un type d'erreur `thiserror` (`koharu-scene`,
  `koharu-storage`, `shenron-manga`…) ; l'orchestration et les binaires utilisent `anyhow`
  (moteur Koharu) ou `miette` (diagnostics de la CLI `shenron`). Aux frontières, l'erreur devient
  une valeur : `Result<_, String>` sérialisé pour une commande Tauri ou un outil MCP,
  `shenron_last_error` pour l'ABI C. Aucune panique ne traverse l'ABI C.
- **Journalisation** : `tracing` dans les bibliothèques, `tracing-subscriber` dans les binaires ;
  pas de `println!` hors des sorties voulues d'une CLI. En MCP stdio, la sortie standard porte le
  protocole : les journaux vont sur la sortie d'erreur.
- **FFI** : Bun n'appelle Rust que par `shenron-ffi` (`@shenron/native`, `bun:ffi`). Les symboles
  `shenron_*` sont `extern "C"` et `#[unsafe(no_mangle)]` ; une chaîne allouée par Rust se libère
  par `shenron_string_free` ; `shenron_abi_version` est vérifiée au chargement et change avec
  toute rupture d'ABI, des deux côtés. Bibliothèque : `SHENRON_FFI_LIB`, `native/` du paquet, ou
  `SHENRON_FFI_DEV=1` pour `target/{release,debug}`. Pas de nouvelle `cdylib` pour Bun.
- **Fichiers générés** : `packages/koharu/src/protocol.ts` (Specta, `just protocol`) se commite et
  ne s'édite jamais à la main ; la sortie WASM (`packages/koharu/src/wasm/`) est ignorée par Git.
- **Tests** : unitaires dans `#[cfg(test)] mod tests`, intégration dans `tests/`. Un test qui
  télécharge, demande un GPU ou un service porte `#[ignore = "raison"]` (ou entre dans le filtre de
  `.config/nextest.toml`). Les fixtures partagées avec Bun vivent une seule fois dans le dépôt
  (`data/<domaine>/fixtures/`, `packages/<paquet>/test/fixtures/`) et sont lues par les deux
  suites : à la compilation par `Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")`, à
  l'exécution par `CARGO_WORKSPACE_DIR` (racine du dépôt, posée par `.cargo/config.toml`).

## Ajouter une crate

1. Créer `crates/shenron-<nom>/` (nom anglais en kebab-case) : le glob `crates/*` l'ajoute au
   workspace.
2. `Cargo.toml` : en-tête SPDX, `name`, `description`, `version.workspace = true` et les autres
   clés héritées, `[lints] workspace = true` (`bun scripts/build/rust/align-crates.ts --write
shenron-<nom>` les pose), dépendances en `{ workspace = true }`.
3. Dépendance nouvelle : présente dans le workspace d'Aphrody → `just deps` ; sinon, la déclarer
   à la main dans la section propre à Shenron de `[workspace.dependencies]`. Vérifier sa licence
   (`just rust-deny`).
4. Si une autre crate en dépend, `just deps` l'ajoute au bloc généré (`path`).
5. Tests : `just rust-test` la prend d'office (`cargo metadata`) ; tests lourds en `#[ignore]`.
6. Exposition à Bun : par un symbole `shenron_*` de `shenron-ffi` (version d'ABI et binding de
   `@shenron/native` mis à jour), jamais par une bibliothèque de plus.
7. Documentation : ajouter la crate à la carte ci-dessus, et à
   [`architecture/STACK.md`](../architecture/STACK.md) si le graphe change.
8. Portes : `just rust-fmt-check rust-lint rust-test deps-check align-check rust-deny`.

## CI

`.github/workflows/rust.yml` se déclenche sur les chemins Rust (crates, manifestes, toolchain,
configurations Cargo, scripts `scripts/build/rust/`) :

- `rustfmt` tourne toujours (il ne lit que les membres du workspace) ;
- Clippy (workspace, puis feature `koharu`), `cargo wasm`, nextest (profil `ci`, rapport JUnit
  en artefact), `workspace-deps.ts --check` et `cargo deny` exigent le secret
  `APHRODY_GIT_TOKEN` et sont sautés sans lui (dépôts sans secret, contributions depuis un fork).

Créer le secret : jeton fine-grained dont le propriétaire est `aphrody-labs`, accès au seul dépôt
`aphrody-labs/aphrody`, permission _Contents: read_ ; l'enregistrer dans _Settings → Secrets and
variables → Actions_ sous `APHRODY_GIT_TOKEN`. Le workflow réécrit `https://github.com/aphrody-labs/`
avec ce jeton pour le CLI git. Caches : `~/.cargo` (Swatinem/rust-cache) et sccache (cache
GitHub Actions). `ci.yml` reste le workflow Bun.
