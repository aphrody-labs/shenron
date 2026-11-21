# Scripts

Scripts Bun et shell du dépôt. La version de Bun est épinglée dans `package.json#packageManager`. Les tâches courantes passent par `just` (`justfile`), qui appelle ces scripts.

## Arborescence

- `audit/` : gardes statiques (`check-paths.ts`, `check-workspace-*.ts`, `workspace-policy.ts`, `source-readiness.ts`) et audits UI/UX.
- `build/` : compilation et empaquetage (`server.ts`, `bot.ts`, `container.ts`, `local.ts`, `video-assets.ts`, `wiki-objects.ts`).
- `data/` : bases et catalogues dérivés (`build-vfs.ts`, `build-dbxv2-*.ts`, `export-catalogues.ts`, `lexicon.ts`, `crawl-beerus-site.ts`).
- `deploy/` : build et livraison d'une révision.
  - `release.sh` : enchaîne `build-image.sh` puis `ship-image.sh` (`--build-only`, `--ship-only`, `--auto`, `--plan`). Runbook : `docs/operations/AUTO-DEPLOY.md`.
  - `lanes.ts` : détection des couloirs changés par une révision (`keys`, `plan`, `history`, `--check`).
  - `environment.ts` : épingles de toolchain (`--check`), `active-release.ts`, `artifacts.ts`, `native-artifacts.ts`.
- `design/` : polices, lettrage, wordmark, catalogue Toriyama, mascottes du wiki.
- `dev/` : environnement de développement (`env-pull.ts`, `remote-dev.ts`, `session-start.ts`, `cloud-*.sh`).
- `editorial/`, `i18n/` : audit des sources de databooks et contrat de complétude des catalogues `fr|en|ja` (`i18n/complete-contract.ts`).
- `media/` : `wiki-scene-assets/` (scènes et vidéos du wiki).
- `ops/` : exploitation, CDN, OCR, lecteurs manga, synchronisations de bases, preuves navigateur ; un script par tâche, usage en en-tête de chaque fichier.
- `parity/` : parité de pixels entre la galerie web et la galerie GPUI.
- `plugin/` : génération et empaquetage du plugin `plugin/` (`build-references.ts`, `agy-manifest.ts`, `pack.ts`, `sync.ts`).
- `release/` : version et publication des téléchargements (`check-version.ts`, `publish-downloads.ts`, `ship-downloads.ts`).
- `testing/` : tests d'intégration, navigateur et portes de qualité native.
- `tools/unified-pipeline/` : orchestrateur de reconnaissance, rendu et audit.
- `video/` : plan et rendu vidéo (`plan.ts`, `render.ts`).
- Racine : `backup-shenron-pg.sh`, `backup-shenron-sqlite.sh`, `shenron-guild-sync.sh`, `workflow.ts`, `workflow-actions.ts`.

## Commandes

```sh
just check          # bun check sur packages et scripts
just lint           # oxlint
just test           # tests des paquets Bun, puis des scripts
just deploy-check   # portes de définition du déploiement
just ship           # scripts/deploy/release.sh
just wasm-sync      # copie les wasm construits dans aphrody-labs/wiki (voir docs/development/rust.md)
```
