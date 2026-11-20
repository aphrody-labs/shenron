# Shenron: agent contract (`AGENTS.md`)

Shenron is the platform behind dragonballfr.com: web portal, Discord bot, API, editorial pipeline (databook OCR and translation), Shenron Studio (manga translation, code name Koharu), media pipelines, RAG and MCP server. It is a standalone product repository (`github.com/aphrody-labs/shenron`, branch `main`) with no dependency on the Aphrody monorepo. `CLAUDE.md` imports this file.

## Stack

- Runtime and tooling: Bun 1.4.5, the official upstream release (no fork). This repository is Bun and TypeScript only. The Rust workspace (engine, API units, native tools, Koharu studio, MCP, FFI, deployd, edge, desktop) lives in `github.com/aphrody-labs/wiki` (`../wiki`, `SHENRON_WIKI_DIR`); Bun scripts consume its output (`docs/development/rust.md`).
- Dependencies come from public npm and PyPI at their newest versions, read live. Code that used to come from Aphrody packages lives in this repository.
- UI: Next.js for the site until ADR 0009 step 7; GPUI (`gpui-kit`, ADR 0008) for native and web application surfaces, which replaced Dioxus and Leptos. ADR 0009 still names Leptos for the public site: open conflict, see `docs/plans/base-ui-vers-gpui.md`.
- Data: PostgreSQL and Redis today (compose on prd); target is native PostgreSQL and no Redis (ADR 0009 steps 2 and 5).
- Direction: self-hosted Rust stack without PaaS, Docker, SSH or nginx (`docs/decisions/0009-auto-hebergement-rust-integral.md`). Step status and evidence: `.claude/goal.json`. Runbooks: `docs/runbooks/` (deployd, Garage CDN, MCP admin); skill `shenron-selfhost`.

## Layout

- `apps/site` (web portal), `apps/bot` (Discord bot), `apps/server` (single Bun server), `apps/activity` (Discord Activity).
- `packages/*` (`@aphrody/shenron-*` workspace packages), `data/` (canonical Dragon Ball content; the wiki repository reads it through `../shenron/data`, `SHENRON_DATA_DIR`).
- `deploy/` (compose, nginx, units, SQL migrations), `scripts/`, `docs/` (ADRs and runbooks), `.agents/skills` (skills).
- Map: `MAP.tsv` lists every area with its tracked file count, bytes, tier and gate; default searches skip vendored trees, lockfiles and generated output (`.rgignore`, `.fdignore`). Rust work and how Bun consumes it: `docs/development/rust.md`.

## Hosts

- `prd`: production, shenron and rosegriffon only. `fr1`: builds and CI. `fr2`: previews, tests, edge (self-hosted Cloudflare). Always `timeout N ssh <host>`.
- rosegriffon is a separate product repo (`$WORKSPACE_ROOT/rosegriffon`) and a separate agent: coordinate through files, never touch its services, take `$DEPLOY_LOCK` before a prd deploy.

## Rules

- Commit directly on `main` in logical commits; run gitleaks before every push. Never `git add -A`, stash or reset on a shared tree. Commit with `git commit -- <paths>`: a plain `git commit` takes every file other agents have staged in the shared index (43 renames were swept into one commit on 2026-11-19). `git pull --rebase` refuses while the tree has unstaged edits: `git fetch`, then push only when behind is 0.
- Tags: `v*` triggers `release.yml`; snapshots use `session-<date>-<sha>`.
- The Bun pin lives in `package.json#packageManager` and `deploy/environment.json`; `bun scripts/deploy/environment.ts --check` fails on drift. The release version source is the root `package.json` (`scripts/release/check-version.ts`).
- fr1 is shared and often loaded (load above 90 on 12 cores was measured): one heavy build at a time, and clean only build outputs you created. Garage replicates every object on each node: check `df` before a mirror or rebalance, and cap the rate, since an uncapped resync to prd (about 1.3 GB/min over WireGuard) cut its inbound UDP and returned 504 on the public site.
- Rust is built in `aphrody-labs/wiki` (on `fr1` or its CI), never here. Never run bare `bun test` at the root: `bun test <package>`.
- Secrets: never print, log or commit values; only `.env.example` is committed.
- Proof is a screenshot of the rendered page or a checked API response, never an HTTP status alone.
- User-facing text goes through the i18n catalogues; no emoji, no AI attribution in code, docs or commits.
- Commands: `just` (see `justfile`): `just check`, `just test`, `just deploy-check`.

## Shared with the sibling product

Shenron (`$WORKSPACE_ROOT/shenron`, dragonballfr.com) and Rose Griffon (`$WORKSPACE_ROOT/rosegriffon`, rosegriffon.fr) share prd and part of their needs. Shared code exists once: a published crate or package, or a git dependency on the product that owns it; never a copy. The owner column is proposed; either agent may change it by editing this table in both files in the same step, and the other agent's work is never overwritten.

| Need | Owner | Consumer |
| --- | --- | --- |
| Koharu: OCR, translation, typesetting (service `koharu.`) | shenron | rosegriffon (wiki, zukan, databooks) calls the service or depends on the `koharu-*` crates of `aphrody-labs/wiki` |
| Video, anime, film (`tv.`): FFmpeg, libvlc, yt-dlp, HLS | shenron | rosegriffon |
| `filmcraft` (video engine): one source `github.com/aphrody-labs/filmcraft`, the vendored copies in both repos are removed | filmcraft repo | both |
| Admin dashboard (Rust, desktop first, web second) | shenron | rosegriffon plugs its own panels in |
| Auth and SSO (Better Auth: oauth-provider, passkey, api-key, agent-auth) | rosegriffon (`@rosegriffon/auth`, superset) | shenron-auth shrinks to Shenron configuration over it |
| Wiki and databook formats, CPK and game archive readers (`shenron-re` game module, `yolo-re-core`) | rosegriffon for Inazuma Eleven formats, shenron for Dragon Ball formats; one shared crate for the generic archive code | both |
| CDN (R2 origin, cdn-sync) | rosegriffon (`infra/docker/cdn-sync`) | shenron |
| Deploy on prd: compose per product, `$DEPLOY_LOCK` (flock) before any prd change, nginx and tunnel routes in each product's own files | each product for its own units | never touch the other product's units |

Coordination goes through files (this table, `docs/` notes, commits on `main`), not through live edits of the other repository.
