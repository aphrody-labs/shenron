# Shenron: agent contract (`AGENTS.md`)

Shenron is the platform behind dragonballfr.com: web portal, Discord bot, API, editorial pipeline (databook OCR and translation), Shenron Studio (manga translation, code name Koharu), media pipelines, RAG and MCP server. It is a standalone product repository (`github.com/aphrody-labs/shenron`, branch `main`) with no dependency on the Aphrody monorepo. `CLAUDE.md` imports this file.

## Stack

- Runtime and tooling: Bun 1.4.5, the official upstream release (no fork). TypeScript only where it is justified; Rust 2024 for the engine, API units and native tools (`migration/rust.toml`, `docs/decisions/0004-migration-typescript-rust.md`).
- Dependencies come from public npm, crates.io and PyPI at their newest versions, read live. Code that used to come from Aphrody packages lives in this repository.
- UI: Next.js for the site; Dioxus (DioxusLabs: dioxus, blitz, taffy) where a Rust UI fits (Studio desktop).
- Data: PostgreSQL and Redis from the official images.

## Layout

- `apps/site` (web portal), `apps/bot` (Discord bot), `apps/server` (single Bun server), `apps/activity` (Discord Activity).
- `packages/*` (`@shenron/*` workspace packages), `crates/*` (`shenron-*`, `koharu-*`, `dragon-pixel`).
- `deploy/` (compose, nginx, units, SQL migrations), `scripts/`, `docs/` (ADRs and runbooks), `.agents/skills` (skills).

## Hosts

- `prd`: production, shenron and rosegriffon only. `fr1`: builds and CI (self-hosted Vercel). `fr2`: previews, tests, edge (self-hosted Cloudflare). Always `timeout N ssh <host>`.
- rosegriffon is a separate product repo (`C:\rosegriffon`) and a separate agent: coordinate through files, never touch its services, take `/srv/deploy.lock` before a prd deploy.

## Rules

- Commit directly on `main` in logical commits; run gitleaks before every push. Never `git add -A`, stash or reset on a shared tree.
- Rust builds on `fr1` or CI, never on the workstation. Never run bare `bun test` at the root: `bun test <package>`.
- Secrets: never print, log or commit values; only `.env.example` is committed.
- Proof is a screenshot of the rendered page or a checked API response, never an HTTP status alone.
- User-facing text goes through the i18n catalogues; no emoji, no AI attribution in code, docs or commits.
- Commands: `just` (see `justfile`): `just check`, `just test`, `just deploy-check`.

## Shared with the sibling product

Shenron (`C:\shenron`, dragonballfr.com) and Rose Griffon (`C:\rosegriffon`, rosegriffon.fr) share prd and part of their needs. Shared code exists once: a published crate or package, or a git dependency on the product that owns it; never a copy. The owner column is proposed; either agent may change it by editing this table in both files in the same step, and the other agent's work is never overwritten.

| Need | Owner | Consumer |
| --- | --- | --- |
| Koharu: OCR, translation, typesetting (service `koharu.`) | shenron | rosegriffon (wiki, zukan, databooks) calls the service or depends on the `koharu-*` crates |
| Video, anime, film (`tv.`): FFmpeg, libvlc, yt-dlp, HLS | shenron | rosegriffon |
| `filmcraft` (video engine): one source `github.com/aphrody-labs/filmcraft`, the vendored copies in both repos are removed | filmcraft repo | both |
| Admin dashboard (Rust, desktop first, web second) | shenron | rosegriffon plugs its own panels in |
| Auth and SSO (Better Auth: oauth-provider, passkey, api-key, agent-auth) | rosegriffon (`@rosegriffon/auth`, superset) | shenron-auth shrinks to Shenron configuration over it |
| Wiki and databook formats, CPK and game archive readers (`shenron-re` game module, `yolo-re-core`) | rosegriffon for Inazuma Eleven formats, shenron for Dragon Ball formats; one shared crate for the generic archive code | both |
| CDN (R2 origin, cdn-sync) | rosegriffon (`infra/docker/cdn-sync`) | shenron |
| Deploy on prd: compose per product, `/srv/deploy.lock` (flock) before any prd change, nginx and tunnel routes in each product's own files | each product for its own units | never touch the other product's units |

Coordination goes through files (this table, `docs/` notes, commits on `main`), not through live edits of the other repository.
