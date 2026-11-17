# Integration of the claude-* slices into main, 2026-11-05

Rule: no branches, worktrees or PRs; everything lands on main. Most slices (admin-purge, aot-build,
aot-lto, bun-native, cargo, deps-js, docs-reset, humanize, lint-backend, lint-site, purge, surface,
theme-pack) were merged on main by other sessions before this run. This run merged the four that
remained: claude-vendor, claude-remote-fleet, claude-deploy and claude-yolo-web-pipeline together
with claude-yolo-web-stdio (708f00fd, taken from the local branch).

Workflow safety: commit 34a3aa3e replaced `server-artifact.yml` by the inert claude-deploy version
before anything else was pushed (the previous one deployed to prod on every push to main).
`AUTO_DEPLOY_ENABLED` and `SHENRON_PROD_RUNNER_READY` are unset, so no push deploys.

## Commands and results (disposable clones, `bun install --frozen-lockfile` first)

Authoritative host: bunos (idle, bun 1.4.6 = packageManager pin). vps runs bun 1.4.4 under load
(load average 50 to 70) and gives timeout noise, kept only for the intermediate slices.

| Tree                    | install | lint | format:check | typecheck    | test (pass / fail) | cargo fmt | clippy  |
| ----------------------- | ------- | ---- | ------------ | ------------ | ------------------ | --------- | ------- |
| vendor 8823db2d (bunos) | 0       | 0    | 1 (11 files) | 1 (9 errors) | 6501 / 1           | 0         | 0 (vps) |
| fleet 085dfa0f (vps)    | 0       | 0    | 1 (10 files) | 1 (9 errors) | 6472 / 16 (load)   | not run   | not run |
| deploy 6f239921 (vps)   | 0       | 0    | 1 (10 files) | 1 (9 errors) | 6471 / 17 (load)   | not run   | not run |
| web 6fa5c1f0 (bunos)    | 0       | 0    | 1 (11 files) | 1 (9 errors) | 6357 / 1           | not run   | not run |

Commands: `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`,
`bun run typecheck`, `bun run test`, `cargo fmt --all --check`, `bun run clippy:rust`,
`bun scripts/deploy/environment.ts --check`, `bun scripts/deploy/lanes.ts --check` (both 0 after merge).
clippy cannot run on bunos (gtk4 missing); it ran on vps. Rust changed only through the filmcraft
removal and the lockfiles.

## Failures against the base

- Only failing test on bunos, vendor and web trees: `@aphrody/shenron-ui portability > no @/ alias and
  no escaping relative imports`. It also fails on the pre-merge main (34a3aa3e with submodules): not new.
- vps failure lists (frame analysis, Bun.Image, timeouts) are the known baseline plus load; the three
  site tests and two bot tests that failed once under load pass in isolation.
- typecheck: 9 errors, all in `apps/site/src/components/wiki/scene/*` (`pixi.js` is only in the root
  catalog, `createPortalDiorama` is not exported from `packages/ui/src/scene3d/index.ts`). They come
  from main commit 4c4e2381, not from the merges. Not fixed here.
- format:check: 11 files, all from recent main commits (site games, admin, scripts/ops, design); not new.
- A real regression of the stdio merge was fixed in 6fa5c1f0: `scripts/ops/crawl-dragon-ball-official.ts`
  and its test did not match the new `YoloWebBatchCapture` types (7 TS errors).

## Conflicts

- bun.lock: took main, regenerated with bun 1.4.6 (8823db2d). Cargo.lock regenerated with cargo.
- Cargo.toml: kept `exclude = ["crates/shenron-video"]` and the production profile; filmcraft stays deleted.
- docs-reset deletions won (INFRA-DELEGATION.md, PROD-HOSTING.md, CONTAINER-COMPLET.md, ENV.md, ...).
- Dockerfile.build and scripts/deploy/build-image.sh: claude-deploy lane/rust-src structure combined with
  the `production` cargo profile (`CARGO_PROFILE`, key includes the profile); `deploy/environment.json`
  rust outputs now under `target/production/`; `themes` classified no-deploy.
- stdio: stale `packages/config` gitlink dropped, `telecharge-planches-dragonballcn.ts` uses `yoloWebScrape`.

## Not proven yet

End to end proofs (image and AOT binaries build, `--version` and `--smoke`, `/api/local/health`,
site start, `/admin/ai`) are listed in the next section once run.

## End to end on a fresh clone of main (085639eb), bunos, bun 1.4.6

| Step                                                                  | Command                                                          | Result                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| install                                                               | `bun install --frozen-lockfile`                                  | exit 0                                                                                                                    |
| lint                                                                  | `bun run lint`                                                   | exit 0                                                                                                                    |
| format                                                                | `bun run format:check`                                           | exit 0                                                                                                                    |
| typecheck                                                             | `bun run typecheck`                                              | exit 0 (main was fixed by other sessions after the gates above)                                                           |
| tests                                                                 | `bun run test`                                                   | exit 1: 6357 pass, 1 fail (`shenron-ui portability`, pre-existing)                                                        |
| bot AOT build                                                         | `bun run build:bot`                                              | exit 0, `shenron-bot` 290 MB                                                                                              |
| server build                                                          | `bun run build:server`                                           | exit 0, `shenron-server` 336 MB                                                                                           |
| server version                                                        | `shenron-server version`                                         | exit 0, `shenron-server 1.4.5 (Bun 1.4.6)`                                                                                |
| bot smoke (bunos)                                                     | `shenron-bot --smoke`                                            | exit 1: no system colour emoji font on bunos (host issue)                                                                 |
| bot smoke (vps, binary copied, `SHENRON_BOT_ASSETS_DIR=<dist>/share`) | `shenron-bot --smoke`                                            | exit 0: `{"smoke":"ok","canvasFonts":11,"canvasFontsMissing":[],"renderAssetsMissing":[],"emojiFont":"Noto Color Emoji"}` |
| server health (vps)                                                   | `shenron-server serve --port 34571` then `GET /api/local/health` | HTTP 200, `ok:true`, version 1.4.5; wiki/rag/vfs/chat groups unavailable (no VFS, no model: expected without data)        |
| site                                                                  | `GET /`                                                          | HTTP 200                                                                                                                  |
| cockpit                                                               | `GET /admin/ai`                                                  | HTTP 307 (redirect to sign-in, route reachable; not signed in)                                                            |

Note: `GET /` logs a server-side error in `frameEpisodes` (no editorial database in this run).

## Not proven

- Container image build (`scripts/deploy/release.sh --build-only`, `Dockerfile.build`): not run; the
  production profile is fat LTO and bunos has about 5 GB of disk left. The merged Dockerfile.build and
  build-image.sh were only checked with `bash -n`, `lanes.ts --check` and `environment.ts --check`.
- Rust binaries (`shenron`, `shenron-mcp`) `--version` and the production-profile build: not run;
  cargo fmt and clippy passed on the vendor merge (vps).
- Site with its test database, and `/admin/ai` signed in: not run.
- Windows gates (shenron-gpu tests): not run.
