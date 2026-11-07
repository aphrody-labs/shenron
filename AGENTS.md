# Shenron contributor rules

Shenron is the product behind dragonballfr.com: the site, the Discord bot, the API, the editorial pipeline (databook OCR and translation), Shenron Studio (the manga translation editor, code name Koharu), RAG and the MCP server. `CLAUDE.md` is a symlink to this file.

## Mission

Rebuild Shenron on Rust and Bun only, and keep the live product running during the move. Rules follow the YOLO repos (`yolo-stack`, `yolo-ui`, `yolo-web`, `yolo-bun`).

## Stack decision

ADR 0003 of yolo-stack sets the stack. The local copy is `docs/decisions/0001-pile-du-site.md`.

- Site: Leptos 0.8 SSR with islands on Axum.
- Native Studio: Dioxus.
- Rendering and layout: wgpu, vello, Parley, Taffy, AccessKit.
- Tooling, scripts, bot, tests: Bun 1.4.4+.
- Out: Next.js, Tailwind, Base UI, shadcn. `apps/site` and `packages/ui` still use them and are being replaced. Add no new dependency of that kind.

## Repo map

- `apps/site`: current site (Next.js). `apps/bot`: Discord bot. `apps/server`: single Bun binary serving site and APIs. `apps/activity`: Discord Activity server.
- `packages/*`: Bun workspace packages named `@aphrody/shenron-*`. Keep these names.
- `crates/*`: Rust workspace (`shenron-*`, `koharu-*`, `dragon-pixel`). `crates/shenron-video` is excluded from the workspace.
- `deploy/`: Docker, compose, Cloudflare worker, SQL migrations. `scripts/`: Bun and shell tooling. `plugin/`: agent plugin sources. `data/`: catalogues and local data.
- `docs/`: see `docs/README.md`.

## Commands

All tasks go through `just` (shell is `bun exec`). Run `just` to list them.

```sh
just install        # bun install --frozen-lockfile
just check          # bun check on packages and scripts, then cargo check
just lint           # bun lint, then clippy with warnings denied
just format-check   # bun fmt --check, then rustfmt
just test           # bun tests, script tests, cargo nextest
just drift          # generated files (OpenAPI, UI tokens, AI contracts) are current
just ci             # what the CI runs
just dev-site       # site dev server
just dev-bot        # bot dev server
```

Format JS and TS with `bun run fmt`; check Rust formatting with `bun run fmt:rust` (`cargo fmt --all --check`). Per package: `bun run --filter <name> <script>`; scripts are listed in each `package.json`. Rust, scoped: `cargo check -p <crate>`, `cargo nextest run -p <crate>`.

## Build and deploy

- Builds run on vps or bunos, never on the Windows PC. Linting and formatting of Markdown or small files are fine locally.
- Release: `bun run ship` (`scripts/deploy/release.sh`) builds the image, then ships and activates it on prod. Details in `docs/operations/deploy.md`.
- Auto-deploy lanes live on branch `claude-deploy` (`docs/operations/AUTO-DEPLOY.md` there). They are not on `main` yet.
- Never push to `main` directly from a session. Work on a branch in a worktree under `C:\src\.wt\shenron\`.

## No human in the loop

- Run end to end. Do not ask for confirmation on reversible choices; pick one and record it in the commit message or an ADR.
- Commit small slices when a slice is green. Commit author is `aphrody-dev`. End messages with the `Co-Authored-By` line given by the session.
- If an external approval or an owner decision is missing, finish the independent work, then report the specific blocker.
- Do not turn an old backlog item into a new task.
- Use Bun 1.4.4+ only. No Node, npm, yarn, pnpm.
- Code identifiers and comments in English. Documentation in French. No emoji. Facts only, no filler.
- User-visible strings go through the dictionaries (`apps/site/messages/{fr,en,ja}.json`).

## Safety

- Never touch production data without a dry-run first, then a verified backup, then the write.
- Never print, log or commit a secret. Name environment variables, never their values.
- Never run a purge, `docker rm`, `rm -rf` or a model deletion on prod. The 2026-11-04 outage came from exactly that (`docs/operations/backup-recovery.md`).
- Use `docker compose up -d --no-deps --no-recreate <service>` to restore one service.
- Do not restore the DBFR dump over prod without a comparison.
- Preserve uncommitted work of other sessions. Do not reset or clean a tree you did not create.

## Pointers

- `docs/README.md`: index.
- `docs/decisions/`: ADRs.
- `docs/architecture/README.md`: layers and runtimes.
- `docs/operations/`: production, deploy, backup and recovery.
- `docs/runbooks/content.md`: content pipelines (OCR, translation, wiki, RAG, CDN).
- `docs/plans/refonte-rust-bun-yolo-stack.md`: the migration plan.
- Models: `C:\src\yolo-stack\AGENTS.md`, `C:\src\yolo-stack\docs\decisions`.

---

## Autonomous NHITL Agent & Context / Token Optimization Best Practices (24/7 Operations)

### 1. Context Window & Token Optimization
- **High-Precision Targeting**: Never dump large raw files into the model context. Use exact byte/line range reads or AST/symbol lookups.
- **Zero-Polling Reactive Wakeup**: When launching background tasks or subagents, do not poll in loops. Yield execution immediately and wait for reactive system events.
- **Compact & High Information Density**: Output concise, fact-based reports with clickable markdown file links (`[file.ext](file:///path/to/file)`). Do not narrate obvious actions.
- **Strict Zero-Emoji Policy**: Zero emojis in all code, comments, commit messages, PRs, logs, and agent communications.

### 2. Autonomous Execution (NHITL - No Human In The Loop)
- **Continuous Grind & Auto-Goal**: Independently identify objectives, resolve compile errors, apply fixes, format (`bun fmt`), lint (`bun lint`), typecheck (`bun check`), test (`bun test` / `cargo test`), commit, and push.
- **Pure Tech Stack**: 100% Upstream Bun v1.4.4+, Rust 2024, Python uv v0.13.7+, Go 1.27+. Zero Node.js, npm, yarn, or pnpm.
- **Strict Isolation & Safe Execution**: Heavy Rust builds run on vps (12 cores) with sccache under shared lock; web and fast tests run on bunos or local Bun.
