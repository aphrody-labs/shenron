# Shenron

Platform behind `dragonballfr.com`: Next.js site, HTTP API server, Discord bot, manga translation studio, and Akira Toriyama databook pipeline built with Rust and Bun.

[![license](https://img.shields.io/github/license/aphrody-labs/shenron)](LICENSE)

## Why

Maintaining community wikis, bilingual manga chapter scans, search indexes, and Discord bots across disconnected scripts creates drift between canonical lore data and production apps. `shenron` brings the web portal, API, Discord bot, native Rust manga studio, and pipeline tools into a single workspace (`shenron-*` crates and `@aphrody/shenron-*` workspace packages).

## Layout

| Path | Role |
|---|---|
| `apps/site` | Web portal (`dragonballfr.com`, Next.js on Bun) |
| `apps/server` | Native Bun HTTP API and asset server |
| `apps/bot` | Discord bot (`discordx`) |
| `apps/activity` | Discord Embedded Activity client |
| `packages/*` | Shared TypeScript packages (`@aphrody/shenron-*`) |
| `crates/*` | Native Rust crates (`shenron-*`, `koharu-*`, `dragon-pixel`) |
| `deploy/` | Cloudflare Worker CDN, containers, and database migrations |
| `scripts/` | Build, audit, translation, and ship automation |

## Install & Development

```sh
bun install
just check
just lint
just test
```

Production deployments target Cloudflare (`deploy/cloudflare`) and origin compute hosts configured dynamically at deploy time via SSH (`just deploy-check`).

Contributions follow the [organization guide](https://github.com/aphrody-labs/.github/blob/main/CONTRIBUTING.md). Report vulnerabilities as described in the [security policy](https://github.com/aphrody-labs/.github/blob/main/SECURITY.md).

## License

Apache-2.0 — see [LICENSE](LICENSE).
