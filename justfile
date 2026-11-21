# SPDX-License-Identifier: Apache-2.0
# One entry point for the Bun tasks of Shenron: `just` lists them. Recipes call the existing
# scripts (package.json, scripts/) and never duplicate their logic. Names follow package.json
# (`format:check` -> `format-check`). Rust is not built here: it lives in aphrody-labs/wiki
# (see docs/development/rust.md).

# Bun Shell runs every recipe line, on Linux, WSL and Windows alike.
set shell := ["bun", "exec"]
set windows-shell := ["bun", "exec"]

[private]
default:
    @just --list --unsorted

# Type-check everything: native bun check (packages and scripts)
[group('all')]
check: typecheck

# Lint everything: native bun lint on apps, packages and scripts
[group('all')]
lint: bun-lint

# Test everything: Bun packages, then root scripts
[group('all')]
test: bun-test test-scripts

# Check formatting: native bun fmt
[group('all')]
format-check: bun-format-check

# Format everything: native bun fmt
[group('all')]
fmt:
    bun scripts/testing/native-quality.ts fmt

# Generated files are up to date (OpenAPI, UI tokens, AI contracts)
[group('all')]
drift:
    bun packages/api/scripts/openapi.ts --check
    bun packages/api/scripts/api-fixtures.ts --check
    bun packages/ui/scripts/generate-tokens.ts --check
    bun packages/pipeline/scripts/ai/check-contracts.ts

# What the CI runs (ci.yml), in one go
[group('all')]
ci: drift typecheck bun-lint bun-test test-scripts

# Install the Bun dependencies from the lockfile
[group('bun')]
install:
    BUN_INSTALL_GLOBAL_STORE=0 bun install --frozen-lockfile

# bun check on every workspace that defines a typecheck script
[group('bun')]
typecheck:
    bun scripts/testing/native-quality.ts check

# bun lint on apps, packages and scripts
[group('bun')]
bun-lint:
    bun scripts/testing/native-quality.ts lint

# bun test of every package (live suites excluded)
[group('bun')]
bun-test:
    bun scripts/testing/workspace-gates.ts test

# Tests of the root scripts (scripts/)
[group('bun')]
test-scripts:
    bun test --path-ignore-patterns='**/*.live.test.ts' ./scripts

# Live suites against real services (SHENRON_LIVE=1)
[group('bun')]
test-live:
    bun --filter @aphrody/shenron-pipeline rag:test

# bun fmt --check on apps, packages and scripts
[group('bun')]
bun-format-check:
    bun fmt --check --ignore-pattern "**/examples/**" --ignore-pattern "**/*.min.js" --ignore-pattern "**/packages/koharu/src/wasm/**" --ignore-pattern "**/packages/engine/src/wasm/**" --ignore-pattern "**/packages/pipeline/src/wasm/**" --ignore-pattern "**/packages/koharu/src/protocol.ts" --ignore-pattern "**/packages/native/src/generated/**" --ignore-pattern "**/plugin/references/**" --ignore-pattern "**/packages/ui/src/tokens.ts" --ignore-pattern "**/packages/lexicon/src/terms.generated.ts" --ignore-pattern "**/packages/m3-tokens/src/compose-m3.generated.ts" --ignore-pattern "**/apps/site/public/wasm/**" --ignore-pattern "**/packages/api/openapi/public.json" --ignore-pattern "**/apps/site/src/app/fonts.css" --ignore-pattern "**/apps/site/scripts/fonts.lock.json" apps packages scripts

# Dragon Ball Ultimate Games Package Manager (SteamDB, Libretro, R2, SteamCMD)
[group('games')]
db-games *args="help":
    bun scripts/ops/dragon-ball-games-manager.ts {{args}}

# Next dev server of the site
[group('bun')]
dev-site:
    bun --filter @aphrody/shenron-site dev

# Remote dev on the build VPS: up | gates | dev | stop | sync | doctor | clean-wsl | backup
[group('bun')]
remote *args="up":
    bun scripts/dev/remote-dev.ts {{args}}

[group('bun')]
env *args="pull":
    bun scripts/dev/env-pull.ts {{args}}

# Discord bot in watch mode
[group('bun')]
dev-bot:
    bun --filter @aphrody/shenron-bot dev

# shenron-server binary (--target linux-x64|windows-x64, --flavor desktop|production, --skip-site)
[group('bun')]
build-server *args:
    bun scripts/build/server.ts {{ args }}

# shenron-bot binary
[group('bun')]
build-bot *args:
    bun scripts/build/bot.ts {{ args }}

# Regenerate the discordx barrel apps/bot/src/_entries.ts
[group('bun')]
entries:
    bun --filter @aphrody/shenron-bot gen:entries

# Gate: the site loader references only wasm files and exports that the build produces
[group('wiki-artifacts')]
dragon-pixel-wasm-check:
    DRAGON_PIXEL_WASM_STRICT=1 bun test apps/site/tests/dragon-pixel-wasm.test.ts

# Container stack: prepare secrets and environment files (--prod|--dev)
[group('container')]
container-env *args="":
    bun scripts/ops/container.ts env {{args}}

# Container stack: build Docker image (--all-in-one)
[group('container')]
container-build *args="":
    bun scripts/ops/container.ts build {{args}}

# Container stack: start containers (--all-in-one)
[group('container')]
container-up *args="":
    bun scripts/ops/container.ts up {{args}}

# Container stack: stop containers
[group('container')]
container-down:
    bun scripts/ops/container.ts down

# Container stack: check service health and status
[group('container')]
container-status:
    bun scripts/ops/container.ts status

# Container stack: initialize database and apply migrations
[group('container')]
container-db-init *args="":
    bun scripts/ops/container.ts db-init {{args}}

# Container stack: OVH operations and DNS validation
[group('container')]
container-ovh *args="":
    bun scripts/ops/container.ts ovh {{args}}

# Container stack: backup container databases
[group('container')]
container-backup:
    bun scripts/ops/container.ts backup

# Connectors: generate ready-to-use configs for Codex, AGY and Claude Code
[group('connectors')]
setup-connectors:
    bun scripts/ops/setup-agent-connectors.ts --write --status

# Connectors: verify connectivity to public and private MCP / A2A / LLM endpoints
[group('connectors')]
connectors-status:
    bun scripts/ops/setup-agent-connectors.ts --status


# Local Docker build into dist/local/ (site|bot|server|image|all; --target linux-x64|windows-x64; image needs the wiki native binaries)
[group('build-local')]
build-local component="all" *args="":
    bun scripts/build/local.ts {{ component }} {{ args }}

# Private-data guard of the local build (--static --context --artifacts <dir>)
[group('build-local')]
build-local-guard *args="--static --context":
    bun scripts/build/local-guard.ts {{ args }}

# Native Windows steps (doctor, smoke, signing on the host): pwsh scripts/build/local-windows.ps1
[group('build-local')]
build-local-windows *args="":
    pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/build/local-windows.ps1 {{ args }}

# Deploy plan of a revision against what production runs (read-only; docs/operations/AUTO-DEPLOY.md)
[group('deploy')]
deploy-plan revision="origin/main":
    bash scripts/deploy/release.sh --plan {{ revision }}

# Change detection dry run over recent commits (what each one would rebuild and restart)
[group('deploy')]
deploy-history count="30":
    bun scripts/deploy/lanes.ts history --count {{ count }}

# Deploy definition gates: pins, classification, tests of scripts/deploy, and real-browser video playback proof
[group('deploy')]
deploy-check:
    bun scripts/deploy/environment.ts --check
    bun scripts/deploy/lanes.ts --check
    bun test scripts/deploy
    bun scripts/ops/verify-player-deployment-gate.ts --episode 875
    bun scripts/ops/verify-player-deployment-gate.ts --episode 1

# Dragon Ball FighterZ: full dump, asset conversion, Zstd compression, and R2 CDN sync
[group('games')]
dbfz-pipeline *args="":
    bun scripts/ops/dbfz-full-dump-converter.ts {{ args }}

# Benchmark compression, decompression, and asset conversion suite
[group('games')]
compression-bench:
    bun scripts/ops/compression-benchmark.ts

# Fail when a workspace manifest pins a version the root catalog already defines
[group('tools')]
check-catalog:
    bun scripts/audit/check-workspace-catalog.ts

# Click through the public catalogues (episodes, movies, manga, databooks); report in var/reports/click-through
[group('tools')]
audit-click-through:
    bun scripts/audit/click-through.ts

# Crawl /api/episodes and probe the player embeds for reachability
[group('tools')]
audit-players:
    bun scripts/ops/crawl-and-audit-players.ts

# Create an article draft from a file
[group('tools')]
article-draft file *args:
    bun scripts/ops/create-article-draft.ts {{ file }} {{ args }}

# Record the owner's short-lived Crunchyroll bearer (needs CRUNCHYROLL_COOKIES_FILE and CRUNCHYROLL_TOKEN_FILE)
[group('tools')]
crunchyroll-session *args:
    bun scripts/ops/crunchyroll-session.ts {{ args }}

# Install the pinned visual skills of .agents/visual-skills.lock.json (--check verifies only)
[group('tools')]
visual-skills *args:
    bun scripts/ops/install-visual-skills.ts {{ args }}

# Ingest OCR results into bot.db_databooks (simulated unless --appliquer; honours the databooks freeze)
[group('tools')]
nourrir-shenron *args:
    bun scripts/ops/nourrir-shenron.ts {{ args }}

# Copy RAG chunks from a SQLite database into the private Shenron corpus (--apply or --pg-csv <out>)
[group('tools')]
rag-offload *args:
    bun scripts/ops/offload-rag-to-shenron.ts {{ args }}

# Plan or run the DBXV2 structured-layer build (needs DBXV2_SERVER_URL, DBXV2_TOKEN, SHENRON_DBXV2_SRC)
[group('tools')]
dbxv2-structured *args:
    bun scripts/data/build-dbxv2-structured.ts {{ args }}

# Export the public catalogues (JSON, CSV, manifest) to var/reports/catalogues
[group('tools')]
export-catalogues *args:
    bun scripts/data/export-catalogues.ts {{ args }}

# Build the Dragon Ball wordmark
[group('tools')]
wordmark *args:
    bun scripts/design/build-dragon-wordmark.ts {{ args }}

# Browser proof of the koharu, dbxv2 and player stacks
[group('tools')]
prove-browser *args:
    bun scripts/ops/prove-browser.ts {{ args }}

# Rebuild the Redis article mirror from PostgreSQL (dry run; --apply writes; needs DATABASE_URL)
[group('tools')]
news-redis-rebuild *args:
    bun scripts/ops/rebuild-news-redis.ts {{ args }}

# Ingest the DBFZ reverse-engineering audit into var/re-telemetry.sqlite
[group('tools')]
re-telemetry-sync:
    bun scripts/ops/sync-re-telemetry.ts

# Type-check scripts/ only
[group('bun')]
typecheck-scripts:
    bun check -p scripts

# Live AI layer suite (Gemini)
[group('bun')]
test-live-ai:
    cd apps/site && SHENRON_LIVE=1 bun test --isolate tests/ai-layer-gemini.live.test.ts

# Cross-package integration suite
[group('bun')]
test-integration:
    bun scripts/testing/integration/run.ts

# Production server of the site
[group('bun')]
start-site:
    bun --filter @aphrody/shenron-site start

# Build the server and the bot binaries
[group('bun')]
build: build-server build-bot

# Next build of the site
[group('bun')]
build-site:
    bun --filter @aphrody/shenron-site build

# Release: build, publish and deploy through scripts/deploy/release.sh
[group('deploy')]
ship *args:
    bash scripts/deploy/release.sh {{ args }}

# Every i18n catalogue is complete
[group('bun')]
i18n-contract:
    bun scripts/i18n/complete-contract.ts

# Path guards
[group('bun')]
check-paths:
    bun scripts/audit/check-paths.ts

# Duplicate assets audit
[group('tools')]
audit-assets:
    bun scripts/audit/assets-dedup.ts

# UI and UX audit of the crawled site
[group('tools')]
audit-uiux *args:
    bun scripts/audit/uiux-audit.ts {{ args }}

# Crawl the site
[group('tools')]
crawl-site *args:
    bun scripts/ops/crawl-site.ts {{ args }}

# Capture one page
[group('tools')]
capture-page *args:
    bun scripts/ops/capture-page.ts {{ args }}

# Read-only production source readiness audit
[group('tools')]
source-readiness *args:
    bun scripts/audit/source-readiness.ts {{ args }}

# Build the private DBXV2 SQLite on the build host: build, embed or plan
[group('tools')]
dbxv2-db *args="plan":
    bun scripts/data/build-dbxv2-db.ts {{ args }}

# Recurring Beerus official-site capture (--out must be outside the repository)
[group('tools')]
beerus-site-sync *args:
    bun scripts/data/sync-beerus-site.ts {{ args }}

# Regenerate the Shenron text font (fontTools through uv)
[group('tools')]
font-build *args:
    bun scripts/design/build-shenron-font.ts {{ args }}

# Regenerate the Shenron lettering font
[group('tools')]
lettering-build *args:
    bun scripts/design/build-shenron-lettering.ts {{ args }}

# Toriyama catalogue freshness gate
[group('tools')]
toriyama-catalog-check:
    bun scripts/design/build-toriyama-catalog.ts --check

# Extract the home palette from the key visual (--write persists it)
[group('tools')]
home-palette image *args:
    bun scripts/design/extract-home-palette.ts {{ image }} {{ args }}

# Placeholder and key parity of edited site message files against a git ref
[group('tools')]
i18n-parity base="origin/main":
    bun scripts/dev/i18n-parity-check.ts {{ base }}

# Read-only inventory of reviewed databook scans
[group('tools')]
databook-sources-audit *args:
    bun scripts/editorial/audit-variant-databook-sources.ts {{ args }}

# Export verified episode frames for wiki scenes
[group('tools')]
wiki-scene-episode *args:
    bun scripts/media/wiki-scene-assets/prepare-episode.ts {{ args }}

# Write the private agent-home knowledge map (dry run unless --apply)
[group('tools')]
agent-home-knowledge-map *args:
    bun scripts/ops/agent-home-knowledge-map.ts {{ args }}

# Archive divergent bot SQLite rows into PostgreSQL (dry run unless --apply)
[group('tools')]
archive-bot-sqlite *args:
    bun scripts/ops/archive-bot-sqlite-variants.ts {{ args }}

# Public CDN HEAD verification of previously missing routes
[group('tools')]
audit-cdn-gaps *args:
    bun scripts/ops/audit-cdn-gaps.ts {{ args }}

# Reader audit of the public site
[group('tools')]
audit-readers *args:
    bun scripts/ops/audit-readers.ts {{ args }}

# Capture a Shueisha public preview: <job> <source-url> <total-pages> <title>
[group('tools')]
capture-shueisha-preview *args:
    bun scripts/ops/capture-shueisha-public-preview.ts {{ args }}

# Official Dragon Ball site crawl: --status, --dry-run or --apply
[group('tools')]
crawl-official *args="--status":
    bun scripts/ops/crawl-dragon-ball-official.ts {{ args }}

# Import the owner's Crunchyroll HAR and cookie export (metadata only)
[group('tools')]
crunchyroll-import *args:
    bun scripts/ops/crunchyroll-har-import.ts {{ args }}

# Editorial collections inventory (output under var/reports)
[group('tools')]
editorial-inventory *args:
    bun scripts/ops/editorial-collection-catalog.ts {{ args }}

# Internet Archive metadata enrichment
[group('tools')]
enrich-internet-archive *args:
    bun scripts/ops/enrich-internet-archive.ts {{ args }}

# Lint, typecheck and format fix loop (report only by default)
[group('tools')]
fix-loop *args="--report-only":
    bun scripts/ops/fix-loop.ts {{ args }}

# Hand the reviewed reader bundle to the outbox
[group('tools')]
manga-reader-handoff *args:
    bun scripts/ops/manga-reader-handoff.ts {{ args }}

# Manga source pool worker queue
[group('tools')]
manga-source-pool *args:
    bun scripts/ops/manga-source-pool.ts {{ args }}

# Find and stage missing databook and manga plates (missing, discover, stage, plan, all)
[group('tools')]
planches-complete *args:
    bun scripts/ops/planches-complete.ts {{ args }}

# Crawl, plan and publish an external source (dry run unless --apply)
[group('tools')]
publish-source *args:
    bun scripts/ops/publish-source.ts {{ args }}

# Wiki proposals: plan or apply MANIFEST SHA256 PLAN [BACKUP_RECEIPT]
[group('tools')]
publish-wiki-proposals *args:
    bun scripts/ops/publish-wiki-proposals.ts {{ args }}

# Off-host copy of the latest verified container snapshot
[group('tools')]
offsite-backup *args:
    bun scripts/ops/shenron-offsite-backup.ts {{ args }}

# Sync the bot private SQLite stores into PostgreSQL (--sqlite PATH --source-id ID)
[group('tools')]
bot-sqlite-to-postgres *args:
    bun scripts/ops/sync-bot-private-sqlite-to-postgres.ts {{ args }}

# Train the Shenron chat model in guarded cycles
[group('tools')]
train-chat *args:
    bun scripts/ops/train-shenron-chat-loop.ts {{ args }}

# Six-hour private wiki proposal supervision: once or smoke --job <absolute path>
[group('tools')]
wiki-fill-supervisor *args:
    bun scripts/ops/wiki-fill-supervisor.ts {{ args }}

# Portable plugin pack in var/plugin-pack (--drive <rclone remote> syncs it)
[group('tools')]
plugin-pack *args:
    bun scripts/plugin/pack.ts {{ args }}

# Pack and audit the public npm packages (--publish uploads absent versions)
[group('release')]
package-publication *args:
    bun scripts/release/publication.ts {{ args }}

# Check the wiki object store
[group('tools')]
wiki-objects-check:
    bun scripts/build/wiki-objects.ts --check

# Qualify a wiki scene video against its manifest
[group('tools')]
wiki-scene-qualify-video manifest output:
    bun scripts/media/wiki-scene-assets/qualify-video.ts {{ manifest }} {{ output }}

# Databooks corpus translation (status by default)
[group('tools')]
databooks-translate *args="--statut":
    bun scripts/ops/translate-databooks-corpus.ts {{ args }}

# Stage the dragon-pixel wasm built in aphrody-labs/wiki (SHENRON_DRAGON_PIXEL_WASM_DIR or <wiki>/target/wasm/dragon-pixel)
[group('wiki-artifacts')]
dragon-pixel-stage *args:
    bun scripts/ops/stage-dragon-pixel-wasm.ts {{ args }}

# Copy the wasm modules built in aphrody-labs/wiki into the tracked src/wasm trees (koharu, engine, shenron-re)
[group('wiki-artifacts')]
wasm-sync:
    bun packages/koharu/scripts/sync-wasm.ts
    bun packages/engine/scripts/sync-wasm.ts
    bun packages/pipeline/scripts/sync-re-wasm.ts

# Native FFI TypeScript tables generated by aphrody-labs/wiki (--check fails when stale)
[group('wiki-artifacts')]
native-generate *args:
    bun packages/native/scripts/generate.ts {{ args }}
