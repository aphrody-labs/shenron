<!-- SPDX-License-Identifier: Apache-2.0 -->
# Shenron

Shenron est le produit de [dragonballfr.com](https://dragonballfr.com) : le site encyclopédique
Dragon Ball en français, le bot Discord, l'API publique, la chaîne éditoriale (OCR et traduction
des databooks), le moteur de traduction manga Koharu, le RAG Dragon Ball et le serveur MCP.

## Installation Windows (un clic)

Pour utiliser Shenron sur un PC Windows 10 ou 11, sans rien installer d'autre :

1. Téléchargez [`install-windows.cmd`](https://raw.githubusercontent.com/aphrody-labs/shenron/main/install-windows.cmd)
   (clic droit sur le lien, « Enregistrer le lien sous… »).
2. Double-cliquez sur le fichier. Si Windows affiche « Windows a protégé votre ordinateur »,
   cliquez sur « Informations complémentaires » puis « Exécuter quand même ».
3. Le script installe ce qui manque (le composant Microsoft WebView2 s'il est absent),
   télécharge la dernière version de Shenron, vérifie son empreinte SHA-256, l'installe pour
   votre compte (sans droits administrateur) et la lance.

Ou, dans PowerShell :

```powershell
irm https://raw.githubusercontent.com/aphrody-labs/shenron/main/install.ps1 | iex
```

Shenron s'installe dans `%LOCALAPPDATA%\Shenron`, crée un raccourci dans le menu Démarrer et se
désinstalle depuis « Paramètres > Applications ». L'application embarque son propre serveur
local : le site, l'éditeur de traduction manga, le studio et la recherche dans le corpus
Dragon Ball fonctionnent sur votre PC. Aucune donnée privée, aucun identifiant n'est fourni :
l'application utilise les adresses publiques de dragonballfr.com.

## Ce que contient le dépôt

| Chemin | Rôle |
| --- | --- |
| `apps/site` | L'application frontale unique (Next 16) : site public, administration, éditeur Koharu (`/koharu`), studio (`/studio`), passerelle MCP publique (`/mcp`). |
| `apps/bot` | Le bot Discord multi-personas et son API publique (Bun). |
| `apps/server` | `shenron-server` : le binaire autonome qui sert l'application frontale et les API locales. |
| `packages/ui` | La couche UI unique : système de design Dragon Ball, lecteurs, éditeur Koharu, studio. |
| `packages/{api,auth,config,db,images,koharu,media,native,pipeline}` | Contrat d'API, authentification, configuration, base de données, assets, client Koharu, médias, liaison native, chaîne éditoriale. |
| `crates/shenron-*` | Rust : CLI `shenron`, serveur MCP, RAG, traduction JP→FR, manga, C ABI, commandes du studio, application de bureau (Tauri 3). |
| `crates/koharu-*` | Le moteur de traduction manga Koharu (détection, OCR, inpainting, rendu, PSD). |
| `plugin/` | Le plugin Claude Code « shenron » (compétences Dragon Ball, MCP). |
| `deploy/`, `config/`, `docs/` | Artefacts de déploiement, configuration publique, documentation. |

## Binaires

| Binaire | Construction | Rôle |
| --- | --- | --- |
| `shenron-server` | `bun scripts/build/server.ts` | Application frontale (Next 16 standalone) + API locales, un seul fichier. |
| `shenron-bot` | `bun scripts/build/bot.ts` | Bot Discord + API publique ; `--smoke` vérifie le binaire sans Discord ni base. |
| `shenron-desktop` | `cargo build --release -p shenron-desktop` | Application de bureau (Tauri 3) qui ouvre l'application frontale servie localement. |
| `shenron` | `cargo build --release -p shenron-cli` | CLI : santé, RAG (`rag local`, `rag ingest`), entraînement, OCR, databooks, manga. |
| `shenron-mcp` | `cargo build --release -p shenron-mcp` | Serveur MCP (stdio, ou `--http ADDR --public` en lecture seule). |

`shenron-server doctor` affiche le profil et la présence des secrets (jamais leurs valeurs) ;
`shenron-server paths` affiche les dossiers. Les secrets de production vivent hors dépôt dans
`<SHENRON_HOME>/config/shenron.env` (droits 600).

## Développement

Prérequis : [Bun](https://bun.sh) ≥ 1.4.2 et Rust 1.98 (`rust-toolchain.toml`).

```sh
bun install --frozen-lockfile
bun run typecheck      # tsc 7 sur les 13 paquets
bun run test           # tests unitaires (les suites *.live.test.ts demandent les services réels)
bun run lint           # oxlint
bun run check:rust     # cargo check du workspace
bun run test:rust      # tests des crates Shenron
```

Les crates d'Aphrody (socle ML, RAG, OCR, Tauri 3) sont des dépendances git épinglées
(`[workspace.dependencies]`, générées par `scripts/build/rust/workspace-deps.ts`). Pour
compiler contre un checkout local d'Aphrody :
`bun scripts/build/rust/local-aphrody-patch.ts ~/aphrody --fetch` (écrit un `.cargo/config.toml`
non suivi).

## MCP

- Plugin Claude Code : `plugin/.mcp.json` lance `shenron-mcp` (stdio).
- Public : `shenron-mcp --http 127.0.0.1:8790 --public` derrière `https://dragonballfr.com/mcp`
  (variable `SHENRON_MCP_URL` du site) ; outils en lecture seule, sans authentification,
  utilisables comme connecteur personnalisé dans les applications web Claude et Gemini.

## Licence

Apache-2.0 (`LICENSE`). Le moteur Koharu (`crates/koharu-*`) est sous MIT OR Apache-2.0
(auteurs d'origine : Mayo Takanashi, Wangchong Zhou ; voir `docs/licenses/koharu`).
Dragon Ball © Bird Studio/Shueisha, Toei Animation : le site est un projet de fans.
