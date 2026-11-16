---
name: cloudflare-platform
description: Cloudflare Developer Platform reference covering Workers (workerd, wrangler), Pages, D1 SQL, R2 Object Storage, KV, Queues, Hyperdrive, and Zero Trust.
---

# Cloudflare Developer Platform Reference

## Tooling

- Default CLI: `cf` (`~/.bun/bin/cf.exe`). Find a command with `cf cli search "<task>"`, preview with `--dry-run` before executing. R2: `cf r2 buckets list`, `cf r2 objects list --bucket-name <b>` (skill `r2`).
- Projects with a Wrangler config (`packages/deploy/wrangler.toml`) use `wrangler` (`~/.bun/bin/wrangler.exe`; install `bun add -g wrangler`; never `bunx wrangler`): `wrangler dev`, `wrangler deploy`, `wrangler tail`, `wrangler types`.
- Engine: `workerd` (open-source JavaScript / Wasm runtime).

## Storage and database primitives

- D1 (serverless SQLite): `wrangler d1 execute <DB_NAME> --local --file=./schema.sql`, `--remote --command="SELECT ..."`, `wrangler d1 migrations apply <DB_NAME> --remote`.
- R2 (S3-compatible): `wrangler r2 bucket create <BUCKET_NAME>`; binding in `wrangler.jsonc`: `"r2_buckets": [{ "binding": "BUCKET", "bucket_name": "<bucket>" }]`. From Bun without the SDK: `Bun.S3Client` (see skill `bun`).
- KV: read-heavy, eventually consistent key-value store. Queues: guaranteed delivery between worker pipelines.

## MCP

Declared for Claude Code on the PC in `tools/agents/toolchain.toml`: `cloudflare` (`https://mcp.cloudflare.com/mcp`) and `cloudflare-docs` (`https://docs.mcp.cloudflare.com/mcp`).

