# Shenron Contributor & Autonomous Agent Rules (`AGENTS.md`)

Shenron (`C:\src\products\shenron`) is the sovereign platform behind **dragonballfr.com**: the web portal, Discord bot, API, editorial pipeline (databook OCR and translation), Shenron Studio (manga translation editor, code name Koharu), 3D/video creative pipelines, RAG, and MCP server. `CLAUDE.md` is a symlink to this file.

## 1. Mission & Sovereign Architecture

Operate and evolve Shenron on **100% Upstream Bun v1.4.4+ and Rust 2024** with zero external bottlenecks, minimal build steps, and sub-millisecond cold starts.

### Stack Architecture (`docs/decisions/0001-pile-du-site.md`)

- **Production Web & Server**: `apps/site` (Next.js 16.5+ standalone optimized for Bun) packaged with `apps/server` into a self-contained Bun runtime binary, migrating progressively to **Leptos 0.8 SSR + Axum** and **Dioxus 0.8 / GPUI**.
- **Native Studio & Rendering**: GPUI / Dioxus 0.8, WGPU 30, Vello, Parley, Taffy, AccessKit.
- **Creative & Engine Extensions**: `crates/bun-engine-core`, `packages/bun-blender` (Blender 5.2.3 LTS headless pipeline), `packages/bun-video-project`, `packages/bun-gamestream`.
- **Tooling, Bot, Scripts & Tests**: Upstream Bun v1.4.4+ only. Zero Node.js, npm, yarn, or pnpm.

## 2. Sovereign Fleet Triad (`vps` / `cdn` / `prod`)

All infrastructure is interconnected over the private WireGuard mesh (`10.200.77.0/24`):

- **`ssh vps` (`10.200.77.1` / `51.77.147.152`)**: 12-core Build Hub, Rust/Bun compilation farm, OCR/RAG batch compute, and mesh hub.
- **`ssh cdn` (`10.200.77.3` / `51.255.162.6`, alias `bunos`)**: Cloudflare Edge Simulator running Pingora Gateway (`yolo-cf-gateway`), Garage S3 R2 (`yolo-cf-garage`), RQLite D1 (`yolo-cf-rqlite`), `workerd` (`yolo-cf-workerd`), Mail, and Auth sync bridges.
- **`ssh prod` (`10.200.77.5` / `72.60.186.43`)**: Bare-metal Arch Linux 7.2.11 production host running `shenron-gateway`, `shenron-site`, `shenron-bot`, `shenron-chat`, `shenron-compute`, `shenron-embed`, `shenron-postgres`, `shenron-redis`, and `shenron-cloudflared`.

## 3. Repository Map

- `apps/site`: Web portal. `apps/bot`: Discord bot (`discordx`). `apps/server`: Single Bun binary serving site and APIs. `apps/activity`: Discord Activity server.
- `packages/*`: Bun workspace packages (`@aphrody/shenron-*`, `bun-blender`, `bun-video-project`, `bun-gamestream`, `bun-engine`).
- `crates/*`: Rust workspace (`shenron-*`, `koharu-*`, `dragon-pixel`, `bun-engine-core`).
- `deploy/`: Docker BuildKit (`deploy/docker`), production compose (`deploy/prod`), Cloudflare Edge Worker (`deploy/cloudflare`), SQL migrations (`deploy/sql`).
- `scripts/`: Automated build (`scripts/build`), zero-downtime deployment lanes (`scripts/deploy`), ops (`scripts/ops`), and testing gates (`scripts/testing`).
- `docs/`: Architecture, ADRs, operations, and runbooks (`docs/README.md`).

## 4. Canonical Commands (`just`)

All tasks execute through `just` using `bun exec`:

```sh
just install        # bun install --frozen-lockfile
just check          # bun check on packages and scripts + cargo check
just lint           # bun lint + cargo clippy (warnings denied)
just format-check   # bun fmt --check + cargo fmt --all --check
just test           # bun tests, script tests, cargo nextest
just drift          # verify OpenAPI, UI tokens, AI contracts, Cargo workspace deps
just deploy-check   # verify deployment environment, lanes, and deploy script tests
just deploy-plan    # preview deployment lane diff against active production release
bun run ship        # build image on vps and stream via Zstd to prod
```

## 5. Build, Bottleneck Elimination & Deployment Rules

- **Zero Bottleneck Builds**: Next.js 16.5 standalone and bot builds run in parallel where independent, using cached layers (Docker BuildKit `--mount=type=cache`) and incremental compilation.
- **Fast Zstd Image Streaming**: `scripts/deploy/release.sh` builds `localhost/shenron:<sha>` on `vps` and streams compressed layers via `zstd -T0` over WireGuard directly to `prod`.
- **Zero-Downtime Service Activation**: Use `docker compose up -d --no-deps --no-recreate <service>` or lane-specific activation (`scripts/deploy/lanes.ts`) so unaffected containers never restart.

## 6. Safety & Production Integrity

- Never touch production data without a dry-run first, a verified backup (`pg_restore -f /dev/null`), and transactional migration (`deploy/prod/apply-migrations.py`).
- Never print, log, or commit secrets. Reference environment variable names only.
- Never run `docker rm`, `rm -rf /srv/shenron/models`, or delete active model weights on `prod`.
- Code identifiers and comments in English; documentation in French; user-visible strings in `apps/site/messages/{fr,en,ja}.json`.
- **Strict Zero-Emoji Policy**: Zero emojis in all code, comments, commit messages, PRs, logs, and documentation.

## 7. Autonomous NHITL Agent Directives (24/7 Operations)

- **High-Precision Targeting**: Read specific line ranges or symbols rather than dumping large files into context.
- **Zero-Polling Reactive Wakeup**: After spawning background tasks or subagents, yield immediately and wait for completion notifications.
- **Continuous Grind & Auto-Fix**: Autonomously diagnose failures, fix code, run `bun fmt`, `bun lint`, `bun check`, `bun test`, and commit clean slices.
