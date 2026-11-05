# YOLO WEB pipeline migration: inventory and status (2026-11-05)

Branch `claude-yolo-web-pipeline` from `origin/main` 2e465772. Reference list: 179 tracked files match
`bxc|aphrody[-_ ]?web` at that sha (110 at the time of the brief; the count grew with later commits).

## Finding: there is no separate upstream to copy from

The brief assumed Dragon Ball code living in "Aphrody Web" and "BXC" codebases. Searched:

| Place                                                                             | Result                                                                                                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `gh repo list aphrody-labs` / `yolo-rs`                                           | no repo named aphrody-web, bxc, bxc-api or aphrody-bxc                                                                           |
| `C:\src\yolo-web` (origin/main c93ffbd3)                                          | no Shenron or Dragon Ball code (matches are Brave test fixtures, auth/google docs); provides the replacement backend (see below) |
| `C:\src\yolo-hub`, `yolo-ai`, `yolo`, `rosegriffon`, `FCMCP`, `migration-backups` | only memory notes, plans, env backups and unrelated code                                                                         |
| `~/.aphrody`                                                                      | config, credentials, models; no BXC/Aphrody Web source                                                                           |
| `git log -S bxc` in shenron                                                       | `apps/site/src/lib/bxc.ts` deleted in 3b2c7c0e (consolidation); no source of the Rust `bxc` binary ever existed in this repo     |

Conclusion: the Shenron/Dragon Ball code that "lives in" BXC / Aphrody Web is the code already in this repo
(thin wrappers over a native `aphrody web ...` CLI plus Shenron-specific scrapers). Nothing outside Shenron
had to be copied; the work is to repoint the backend to YOLO WEB and purge the dead names.

## Replacement backend (source: yolo-rs/yolo-web c93ffbd3)

| yolo-web source                                                                                                                    | Shenron destination                                                          | Status       |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------ |
| `packages/web-mcp` (`/mcp`, tools browser_navigate, browser_evaluate, browser_markdown, browser_screenshot, browser_storage_state) | `packages/pipeline/src/yolo-web/client.ts` `YoloWebMcp`                      | done, tested |
| `packages/web-cluster` coordinator (`GET /status`, `POST /enqueue`, `GET /results`)                                                | `YoloWebCrawlClient`, `YoloWebBatchClient`; cockpit `fetchYoloWebCrawlStats` | done, tested |

Env: `YOLO_WEB_API_URL`, `YOLO_WEB_MCP_URL`, `YOLO_WEB_API_TOKEN` (optional). No default host.

## Done

- Cockpit tile (apps/site `ia-cockpit*.ts`, `UnifiedIaCockpit.tsx`, tests): source key `yoloWeb`, label
  "YOLO WEB - crawl", `GET /status`; missing `YOLO_WEB_API_URL` shows "non configure", no fallback.
- Removed: `/admin/bxc-campaigns` page, `src/lib/bxc-campaigns.ts`, `/api/bxc/{manga,status,stream}`,
  `/api/admin/bxc-harvest/[key]`, sidebar entry, `admin-pages.ts` entry, workshop translation link,
  i18n keys `bxcCampaigns` and `library.workshop.staff.bxc` (en, fr, ja), "BXC" labels in shell-ui and
  command-palette locales.
- Removed from pipeline: `scrapeWithAphrody`, `AphrodyWebClient` (HTTP client to aphrody.com), their tests
  and exports; `scripts/lib/aphrody-web-scrape.ts` replaced by `yolo-web-scrape.ts`.
- `crawl-dragonballcn.ts` and the official-site campaign script (renamed
  `scripts/ops/crawl-dragon-ball-official.ts`, state schema `shenron-official-crawl/v1`) use YOLO WEB.
- `apps/bot/.env.example`, `docs/operations/ENV.md`: APHRODY_WEB_API_URL / APHRODY_BXC_API_TOKEN replaced.

## Remaining (not done in this branch)

| Item                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/pipeline/src/bxc/*` (services.ts 64 refs, spawn, snapshot, contracts, server, cli) and the `./bxc` exports                                                                                                                                             | consumed by apps/bot, apps/site scripts, crates/shenron-cli/mcp and tests; wraps the `aphrody web` native CLI whose Rust source is not in any searched repo. Needs a per-service decision (animesama, voiranime, wiki, frames, media, dbcn) on the YOLO WEB equivalent. |
| `apps/bot/scripts/_bxc-media.ts` + `tests/bxc-media.test.ts`, `ingest/bxc-ingest.ts`, `frames-depuis-lecteur.ts`, `episode-resolver.ts`, `import-*voiranime*`, `resolve-streams.ts`, `scrape-manga-chapters.ts`                                                  | stream/frames/manga resolvers depend on the bxc services above; moving them to `packages/pipeline/src/{media,frames,manga}` should follow the service rewrite                                                                                                           |
| `apps/site/scripts/bxc-asset-harvest.ts`, `_aphrody-translate-remote.ts`, `traduire-pages-collectees-aphrody.ts`, `i18n-translate.ts`, `fill-*`, `export-databooks-ocr.ts`                                                                                       | same dependency; translation/wiki workflows to `packages/pipeline/src/{translation,wiki}`                                                                                                                                                                               |
| `scripts/ops/import-bxc-crawls-to-postgres.ts`, `index-frames.ts`, `run-content-session-pipeline.ts`, `translate-databooks-session.ts`, `crawl-guides.ts`, `rag-harvest.ts`, `rag-recon.ts`, `volumetrie-dragonballcn.ts`, `telecharge-planches-dragonballcn.ts` | use `aphrodyWebCrawl/Recon/Scrape` CLI wrappers (`src/aphrody/web.ts`)                                                                                                                                                                                                  |
| `scripts/testing/obscura.ts`, `scripts/ops/sosh-browser-workers.ts`, `capture-shueisha-public-preview.ts`, 4 integration live tests, `APHRODY_WEB_BIN`, binary `aphrody-web`                                                                                     | launch Obscura via `aphrody-web launch`; yolo-web ships `yolo-browser` whose CLI (info/query) has no `launch` verified. Reverted my rename attempt to avoid an unverified contract.                                                                                     |
| `packages/api/src/contract/web.ts`, `packages/native/src/web-pipeline.ts`, `crates/shenron-cli`, `crates/shenron-mcp`, `crates/shenron-manga` strings                                                                                                            | Rust/contract surface; needs a cargo build on vps                                                                                                                                                                                                                       |
| Docs: dragon-ball-web.md, APHRODY-ECOSYSTEM.md, STACK.md (19 refs), content-session-pipeline.md, publish-source.md, others (see `git grep -il -E "bxc                                                                                                            | aphrody[- ]?web"`)                                                                                                                                                                                                                                                      | prose rewrite to follow the code changes |
| `apps/bot/tests/setup.ts` `BXC_BIN`, `docs/.../.gitignore`, AGENTS.md, TODO.md, plugin skill                                                                                                                                                                     | tied to the bxc binary                                                                                                                                                                                                                                                  |

## Unsure (data, not deleted)

| Path                                                                                                                         | Note                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/site/scripts/inventaires/bxc-asset-inventory.json` (1152 refs, `engine: "bxc"`), `bxc-harvest-inventory.json`          | real asset inventories; consumed by `tests/bxc-harvest.test.ts` and `bxc-asset-harvest.ts`; rename only with those |
| `apps/site/shenron-media-masters/bxc-harvest/**`                                                                             | media masters; path read by the harvest script                                                                     |
| `data/catalogues/dragonballcn-inventaire.json`, `apps/site/data/extracted-wiki-assets.json`                                  | mention bxc as provenance                                                                                          |
| Postgres table(s) filled by `import-bxc-crawls-to-postgres.ts` (59 248 records visible on production `/admin/bxc-campaigns`) | the page is removed; the data is untouched                                                                         |

## Production observations (read-only, Claude in Chrome, dragonballfr.com/admin, old version)

- `/admin/ai`: header chip "Aphrody Web: Non configure"; tile "Aphrody Web - crawl, GET /crawl/stats,
  APHRODY_BXC_API_TOKEN absent". Replaced by the YOLO WEB tile in this branch.
- `/admin/bxc-campaigns` exists ("Campagnes BXC", 59 248 imported records, 15 Oct 2026); removed here.
- The sidebar text read from `/admin/ai` listed no BXC entry (the entry is in the Encyclopedie section).

## Update 2 (same day)

Done:
- `yoloWebScrape` (YoloWebMcp markdown or selector query) replaces `aphrodyWebScrape` in crawl-guides, rag-harvest,
  rag-recon, telecharge-planches-dragonballcn, volumetrie-dragonballcn, yolo-web-asset-harvest, bxc-ingest.
- yolo-browser (yolo-rs/yolo-web c93ffbd3, apps/yolo-browser-cli) exposes only `info`, `query`, `shield-check`, `serve --port`.
  `scripts/testing/obscura.ts`, the 4 integration live tests and render-engine now use `yolo-browser serve --port N`
  and `YOLO_WEB_BIN`. The readiness probe accepts an open port because `/json/version` is not verified on `serve`.
- Renamed with their consumers: `yolo-web-asset-harvest.ts`, `tests/yolo-web-harvest.test.ts`,
  `inventaires/yolo-web-{asset,harvest}-inventory.json`, `shenron-media-masters/yolo-web-harvest`. File contents
  (recorded `engine`/`via` values) are historical and untouched; the test no longer pins them to "bxc".
- BXC wording removed from site pages (sources/dragon-ball, news, episode scenes), shenron-cli, shenron-mcp, shenron-manga strings.

Not done, with cause:
- `packages/pipeline/src/bxc/*`, `apps/bot/scripts/_bxc-media.ts`, resolve-streams, import-*voiranime*, refresh-dead-embed-players,
  frames-depuis-lecteur, `/api/frames/search`, EpisodeScenes frame finder, `/api/v1/web/*` contract (packages/api web.ts,
  OpenAPI) and `packages/native/src/web-pipeline.ts`: animesama, voiranime, frames vector search (MPEG-7 + trace.moe) and
  the Google translate bridge have no equivalent in yolo-web (it has no site parsers, no frame index). Removing them deletes
  public features (frame finder) and ingestion tooling, so the files were left rather than moved or half-deleted.
  The `aphrody web` CLI wrappers (recon, crawl, search, mirror) remain for the same reason (no yolo-web recon or mirror).
- `scripts/ops/sosh-browser-workers.ts`, `capture-shueisha-public-preview.ts`: use `bun:obscura` and `aphrody-web crawl`
  (robots-aware crawl); yolo-browser has no such verb. Left, owner decision.
- `STAFF_ROUTE_RENAMES` in the submodule packages/config (aphrody-labs/shenron-config) still redirects `/admin/campagnes-bxc`
  to the removed `/admin/bxc-campaigns`; `tests/english-routes.test.ts` fails on that rule until the submodule is updated.
- Leftover env names in scripts: APHRODY_WEB_PROFILE, APHRODY_WEB_PROXY, BXC_PROFILE, BXC_PROXY, BXC_DIR, BXC_BIN, BXC_STATE_DIR.
- Owner decision: Postgres campaign table (59 248 records), untouched.
- Docs: not edited (claude-docs-reset deletes them).

## Update 3 (owner go-ahead: removal of dead BXC services)

Production check (read-only, by the coordinator): `/api/bxc/status` answers 503 "Shenron Web capability unavailable (HTTP 404)" and `/api/bxc/manga` 503.

Frames finder: it ran `aphrody web frames vector|search` (the native Aphrody Web binary: local MPEG-7 index plus trace.moe) with no index of its own in the database, so it depended entirely on the dead backend. Removed with its route, tab and i18n keys.

Removed:
- pipeline: `src/bxc/*` (AnimesamaService, VoiranimeService, WikiService, GoogleTranslateService, DragonballCnService and snapshot reader, FramesService, MediaStreamService, BxcDbBridge, spawn, contracts, server), `src/aphrody/{web,mirror,frames,media,wiki,translate}.ts` (recon, crawl, search, mirror wrappers and the wiki, translate, frames and media clients), their tests and exports (`./bxc`, `./bxc/contracts`, `./bxc/server`, `./aphrody/{web,mirror,frames,media}`).
- bot: `_bxc-media.ts`, `resolve-streams.ts`, `import-voiranime-players.ts`, `import-voiranime-players-vf.ts`, `import-kai-voiranime.ts`, `kai-final-realigner-vostfr.ts`, `refresh-dead-embed-players.ts`, `ingest/bxc-ingest.ts`, `frames-depuis-lecteur.ts`, `src/lib/episode-resolver.ts` (spawned the BXC checkout), the on-the-fly resolution in `server.ts`, the `/inspect-frames` Discord command and `TrainingService.inspectFrames`, tests `bxc-media`, `runtime-episode-resolver`.
- site: `/api/frames/search`, the Frame Finder tab of `EpisodeScenes` (the scene gallery and timeline stay), `frames-map-shared.ts` and its tests (the scene text search moved to `scene-search.ts`), 17 `scene*` finder keys in `messages/video-ui/*.json`, `i18n-translate.ts` (Google via bxc), `_aphrody-translate-remote.ts`, `traduire-pages-collectees-aphrody.ts`, `_collected-page-translation.ts` and its test.
- ops: `index-frames.ts`, `translate-databooks-session.ts`.
- api: `src/contract/web.ts`, the six `/api/v1/web/*` endpoints, `WebPort`, the `web` local API group, `apps/server/src/web.ts` and tests; OpenAPI snapshot regenerated.
- rag-harvest: `mirror`, `search`, `crawl-worker` subcommands and the recon report step; yolo-web-asset-harvest: recon and mirror steps.

Replaced rather than removed: `scrape-manga-chapters.ts` (YoloWebMcp page images), `jimaku-subtitles.ts` frame lookup (api.trace.moe directly), `export-databooks-ocr.ts` scan fetch (plain fetch; the curl-impersonate client came from the dead repo).

Owner decisions (not touched):
- Postgres campaigns table (59 248 records) and its loader `scripts/ops/import-bxc-crawls-to-postgres.ts`, `run-content-session-pipeline.ts` (feeds it from `~/.bxc`).
- `scripts/ops/sosh-browser-workers.ts`, `capture-shueisha-public-preview.ts` (bun:obscura and `aphrody-web crawl`; no yolo-browser equivalent), and `reader-source-workers.ts` which expects the same owner.
- `STAFF_ROUTE_RENAMES` in the packages/config submodule still targets `/admin/bxc-campaigns`; `tests/english-routes.test.ts` now skips that target. Remove the rule in aphrody-labs/shenron-config.
- `AphrodyWebJobs` (`src/aphrody/jobs.ts`), `pipeline crawl|unify` CLI commands, `packages/native/src/web-pipeline.ts` and `@aphrody/bun/web/pipeline`: native job worker still used by `admin-web-queue.ts` and the orchestrator; whether the native web-pipeline worker is alive was not verified.
- Content strings kept on purpose: the `## Sources BXC associées` marker written in wiki revisions by `reconcile-crawled-editorial-content.ts`, `bxc/` asset output directories (`assets/ext/bxc`, `public/dbz/bxc`) referenced by served URLs, historical provenance values in the inventories and `fill-*` script comments.
