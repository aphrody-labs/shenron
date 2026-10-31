<!-- SPDX-License-Identifier: Apache-2.0 -->
# Environnement de développement distant (VPS uniquement)

WSL ne sert plus qu'à éditer (VS Code) : installation, portes, Rust et serveur de dev tournent sur
le VPS de build (`vps`, 12 cœurs). `scripts/dev/remote-dev.ts` enchaîne tout, de bout en bout.

## Boucle

| Commande | Effet |
| --- | --- |
| `just remote` ou `bun run dev:remote` | `up` : synchro, `bun install --frozen-lockfile`, portes, puis serveur de dev |
| `bun scripts/dev/remote-dev.ts gates [--rust]` | typecheck, lint, format, tests, tests de `scripts/`, dérive OpenAPI (et clippy + nextest) |
| `bun scripts/dev/remote-dev.ts dev` | Next dev dans la session tmux `shenron-dev` du VPS, relayé sur `http://localhost:3000` |
| `bun scripts/dev/remote-dev.ts stop` | arrête le serveur distant et le relais local |
| `bun scripts/dev/remote-dev.ts run -- <commande>` | synchro puis commande quelconque dans le checkout distant |
| `bun scripts/dev/remote-dev.ts doctor` | outils, charge, disque, état du checkout et du serveur |

Les mêmes entrées existent en tâches VS Code (`.vscode/tasks.json` : build par défaut = `up`, test
par défaut = `gates`).

## Synchronisation

L'arbre de travail exact (HEAD, modifications et fichiers non suivis, `.gitignore` respecté) est
figé dans un commit hors index, poussé par SSH vers `~/shenron-dev` du VPS (`refs/dev/snapshot`)
puis extrait ; le VPS récupère d'abord `main` depuis GitHub (`refs/seed/main`) pour que seul le delta local voyage. Les sorties ignorées (`node_modules`,
`target`, `.next-dev`) restent chaudes d'une synchro à l'autre. Les commandes distantes tournent en
`nice 10` ; Cargo y tourne tel quel. Hôte : `--host <alias>` ou
`SHENRON_DEV_HOST` ; port local : `SHENRON_DEV_PORT`.

## WSL propre

`clean-wsl` liste, et avec `--apply` supprime, les artefacts régénérables de tous les checkouts
Shenron de la machine (arbre principal et worktrees liés) : `target`, `dist`, `.cache`,
`graphify-out`, `.next*`, `apps/server/.build`, binaires du bureau, `node_modules`. Le
`node_modules` de l'arbre principal reste : le timer `shenron-rag-sync` (RAG de production) exécute
`packages/pipeline` depuis `~/shenron`. Le stockage Podman rootless se supprime par `podman unshare`.

## Sauvegarde du vital

`backup --apply` écrit `/mnt/c/shenron/vital/shenron-vital-<horodatage>.tar.zst` (zstd 19, trois
archives gardées, refus si la place manque sur C:) : `data/home` sans les modèles,
`data/source-acquisition`, triplets RAG, `apps/bot/data`, revendications `.coord/claims`, secrets
`~/.aphrody/private/shenron` (sans ses copies `home` et `qualification`) et la mémoire Claude du
projet. Les modèles (3 Go) et tout ce que Git, une installation ou un build recréent n'y vont pas.
Restauration : `tar --zstd -xf <archive> -C /`.
