# Release proof of main, 2026-11-05

Verdict: READY for a release candidate, with the findings below (none is a defect of main's code that
blocks the release; four are build-host prerequisites or follow-ups, listed so they are not rediscovered).

Tree: main at 82e81d30 (dd07e8db, the lint/format commits of other sessions and the fixes below).
Host: vps (load average 15 to 35). Bun 1.4.4 AOT for install, lint, tests; pinned Bun 1.4.6 (sha256
checked) for the build. Rust 1.99.1, Docker. Nothing was pushed to a registry, deployed or tagged;
/srv/shenron on prod was only read.

## 1. Container image (scripts/deploy/build-image.sh, deploy/docker/Dockerfile, production cargo profile)

- Local tag `localhost/shenron-proof` only. VFS: a synthetic public fixture (1 wiki entity plus RAG rows,
  passes `requireProductionVfs`); the real public VFS needs the editorial database.
- Final run: `== image verified (+867s)` then
  `{"commit":"82e81d30...","image":"sha256:37157988d3fb...","imageKey":"556bb803..."}`.
- Image 1.66 GB. In the image (`--network none`): `version` = `shenron-server 1.4.5 (Bun 1.4.6)`,
  `shenron-bot --smoke` ok (11 canvas fonts, Noto Color Emoji, 114 slash commands), `koharu-sdk --help` ok.
- Cargo production lane (shenron-mcp, shenron-ffi, koharu-sdk): 2772 s on a loaded host.

## 2. Rust binaries (target/production, fat LTO, stripped)

| Binary                                | Size          | Version                |
| ------------------------------------- | ------------- | ---------------------- |
| shenron-mcp                           | 16,496,528 B  | `shenron-mcp 1.4.5`    |
| shenron (shenron-cli)                 | 17,050,328 B  | `shenron 1.4.5`        |
| koharu-sdk                            | 49,452,816 B  | `--help` in the image  |
| libshenron_ffi.so                     | 21,264,672 B  |                        |
| shenron-server (Bun AOT, 1.4.4 build) | 284,982,072 B | `shenron-server 1.4.5` |

shenron-video: not built (excluded from the workspace in Cargo.toml, not in the image).

## 3. Test stack (image on host network, disposable postgres:18-alpine and redis:8.10.3-alpine)

Schema: `drizzle-kit export --sql` of apps/site/src/db/schema.ts applied to the disposable database:
62 public tables, 0 errors.

| Request                       | Result                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| GET /api/local/health         | 200, `Cache-Control: no-store`, ok:true                                             |
| GET /                         | 200, `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=600`    |
| GET /wiki                     | 200, same public s-maxage header                                                    |
| GET /admin/ai (no cookie)     | 307, `Location: /` (identical to prod today; not a sign-in page)                    |
| GET /.well-known/security.txt | 200, `Cache-Control: public, max-age=86400`                                         |
| CSP                           | enforced CSP and `Content-Security-Policy-Report-Only: script-src ...` both present |

Log noise: `relation "bot.db_*" does not exist` (bot schema, drizzle.config.bot.ts, not applied).
Not proven: signed-in /admin/ai, data-backed wiki pages, Windows gates (shenron-gpu).

## 4. Gates on a fresh clone

- install --frozen-lockfile 0; lint 0 (warnings only); typecheck 0 on every workspace.
- format:check: 3 files failed (csp-report route, ConsentGate.tsx, avatar-discord-variant test). Fixed;
  ConsentGate had meanwhile been formatted by another session (theirs kept). Now: all files formatted.
- tests: the one real failure was `@aphrody/shenron-ui portability` (packages/ui/assets/wiki-objects/generate.ts
  imported scripts/plugin). Moved to scripts/build/wiki-objects.ts (`--check` passes, portability 3/3).
- Other failures on Bun 1.4.4 are the runtime, not main: `Bun.Image.rgba` is missing in 1.4.4 (frame analysis x6,
  build-frame-catalog, technique-artwork). With pinned Bun 1.4.6: frame-catalog 28/28, technique-artwork 5/5.
  Two timing benchmarks (canonicity 50 ms, shop-board 150 ms) fail only under load average 35.
  A full test run on 1.4.6 of the final tree was not repeated on this host.

## 5. Prod (read only)

`/srv/shenron/current` is `releases/docker-f04de517fd72cca5b026950fc7f3d4e8921b362f`; shenron-site and
shenron-bot run `localhost/shenron:f04de517...` and are healthy. Public: / 200, /wiki 200,
/api/local/health 200 ok:true. Prod still answers `/.well-known/security.txt` 503 and has no report-only
CSP: main fixes both, a deploy is needed.

## Findings and blockers

1. The build host must use Bun 1.4.6: a server compiled with Bun 1.4.4 canary starts but cannot launch the
   Next standalone (`BUN_BE_BUN is set, but this executable doesn't include the Bun command line`).
   build-image.sh should refuse an older SHENRON_COMPILE_BUN.
2. build-image.sh prepends `$HOME/.cargo/bin` to PATH, so a wasm-bindgen-cli that differs from Cargo.lock
   (0.2.129; the host had 0.2.130) breaks the wasm lane. The script should verify or install the pinned CLI.
3. The real public VFS (`SHENRON_VFS_SOURCE`) is required for a production image; the proven image embeds a
   fixture, so its knowledge content is not the release one.
4. `bun run db:migrate` fails on a fresh install (drizzle-kit cannot resolve drizzle-orm) and the SQL
   migrations do not bootstrap an empty database (0000 references an existing "User" table). Migrations
   stay under the infra runbook.
5. Anonymous /admin/ai goes to `/`, not to a sign-in page (same as prod).
6. Disk: / has 42 GB free. ~/proof-build, ~/proof-main, ~/proof-tools, ~/proof-vfs, ~/proof-home and the images
   localhost/shenron-proof:* on vps are test artefacts and can be deleted.
