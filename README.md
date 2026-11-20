# Shenron

Platform behind `dragonballfr.com`: Next.js site, HTTP API server, Discord bot, manga translation studio, and Akira Toriyama databook pipeline, written in Bun and TypeScript.

[![license](https://img.shields.io/github/license/aphrody-labs/shenron)](LICENSE)

## Why

Maintaining community wikis, bilingual manga chapter scans, search indexes, and Discord bots across disconnected scripts creates drift between canonical lore data and production apps. `shenron` brings the web portal, API, Discord bot, and pipeline tools into a single Bun workspace (`@aphrody/shenron-*` packages). The Rust workspace (engine, Koharu studio, `shenron-mcp`, FFI, deployd, edge, desktop) lives in [aphrody-labs/wiki](https://github.com/aphrody-labs/wiki).

## Layout

| Path | Role |
|---|---|
| `apps/site` | Web portal (`dragonballfr.com`, Next.js on Bun) |
| `apps/server` | Native Bun HTTP API and asset server |
| `apps/bot` | Discord bot (`discordx`) |
| `apps/activity` | Discord Embedded Activity client |
| `packages/*` | Shared TypeScript packages (`@aphrody/shenron-*`) |
| `data/` | Canonical Dragon Ball content; the wiki repository reads it through `../shenron/data` (`SHENRON_DATA_DIR`) |
| `deploy/` | Systemd units, edge and Garage configuration, SQL migrations, release scripts (legacy: compose, nginx, Cloudflare Worker) |
| `scripts/` | Build, audit, translation, and ship automation |

## Install & Development

```sh
bun install
just check
just lint
just test
```

## Self-hosting

Production moves to a Rust stack on our own hosts, without a PaaS, Docker, SSH or nginx: [ADR 0009](docs/decisions/0009-auto-hebergement-rust-integral.md). Status per step lives in `.claude/goal.json`; dated dependency versions in [`docs/research/rust-stack-2026-11-19.md`](docs/research/rust-stack-2026-11-19.md). The Rust pieces are built in [aphrody-labs/wiki](https://github.com/aphrody-labs/wiki); this repository consumes their output through `scripts/build/wiki-artifacts.ts` ([`docs/development/rust.md`](docs/development/rust.md)).

| Piece | Location | Replaces |
|---|---|---|
| Release agent, signed manifests, atomic swap and rollback | `shenron-deployd` (wiki) | SSH and `git pull` deploys |
| Reverse proxy, TLS, ACME, disk cache | `shenron-edge` (wiki), `deploy/edge` | nginx, certbot |
| Object storage and CDN origin | `deploy/garage` | Cloudflare R2 and the CDN Worker |
| MCP server, public and admin tiers | `shenron-mcp` (wiki) | ad-hoc SQL consoles |

Bun is pinned once: `package.json#packageManager` and `deploy/environment.json` (checked by `bun scripts/deploy/environment.ts --check`). Deploys follow `docs/runbooks/` and `just deploy-check`; a prd change takes the deploy lock first.

Contributions follow the [organization guide](https://github.com/aphrody-labs/.github/blob/main/CONTRIBUTING.md). Report vulnerabilities as described in the [security policy](https://github.com/aphrody-labs/.github/blob/main/SECURITY.md).

## License

Apache-2.0, see [LICENSE](LICENSE).
