# Bun-native dependency audit, 2026-11-05

Branch `claude-bun-native`, base `2e465772`. Measured on vps (Bun 1.4.4-canary.1+11c367163, same revision as the PC).

## Native surface verified (vps)

Present: Bun.Image (metadata, resize, modulate, flip, flop, rotate, png/jpeg/webp/avif/heic encoders, bytes/blob/buffer/write; no `rgba`, no raw pixels, no stats), Bun.markdown, Bun.YAML, Bun.TOML, Bun.JSONC/JSON5/JSONL, Bun.XML, Bun.sql/SQL/postgres, Bun.s3/S3Client, Bun.redis/RedisClient, Bun.secrets, Bun.cron, Bun.password, Bun.CSRF, Bun.semver, Bun.Glob, Bun.Archive, Bun.WebView, Bun.Terminal, Bun.zstd*/gzip/deflate, Bun.hash/CryptoHasher, Bun.randomUUIDv5/v7, Bun.stringWidth/wrapAnsi/stripANSI, bun:sqlite, bun:ffi, URLPattern, CompressionStream, Worker, structuredClone, Temporal.
Absent: `bun:yolo`, `bun:app`, any native AI/model API (no `Bun.ai`, `Bun.llm`, `Bun.embed`). AI stays on `ai` + `@ai-sdk/*` over the local inference HTTP services.

## Bun version

`packageManager` says `bun@1.4.6`; the `setup-bun` action downloads it from aphrody-labs/bun, and no `aphrody-v1.4.6` release exists there. The all-in-one image pins `1.4.3-aphrody.2`; vps and the PC run 1.4.4-canary.1. Not changed here: needs an owner decision.

## Before / after

| Metric                           | Before  | After   |
| -------------------------------- | ------- | ------- |
| bun.lock packages (entries)      | 1258    | 1247    |
| `bun install` packages installed | 1043    | 1032    |
| node_modules size (du -sk)       | 2023060 | 1931168 |
| node_modules files               | 85569   | 81668   |

Direct dependency counts (dependencies + devDependencies):

| Package              | Before    | After     |
| -------------------- | --------- | --------- |
| apps/site            | 82+10     | 78+10     |
| packages/crunchyroll | 3+1       | 2+1       |
| all others           | unchanged | unchanged |

## Removed (zero imports in src, scripts, tests, configs)

- site: `@aphrody/http`, `@better-auth/passkey` (still used by packages/auth and packages/api), `pixi.js`, `kysely`.
- crunchyroll: `@aphrody/shenron-config`.

## Replaced

- sharp -> Bun.Image in packages/pipeline: `src/cli.ts` (2x metadata), `scripts/assets-dragonballcn.ts`, `selfhost-manga-pages.ts`, `telecharge-couvertures-dragonballcn.ts`, `telecharge-planches-dragonballcn.ts`, `ingest-dragonball-volumes.ts` (resize+png only). Verified on vps: metadata, webp, resize with one dimension, path input.

## Must stay

- sharp: packages/images (hash, pixels, ink-stroke, PSNR need raw pixels; `Bun.Image.rgba` absent), apps/bot (`clean-fullcolor-promos.ts` uses stats; wiki-illustration metadata only), apps/site (admin-image-verify decodes with limits and stats), pipeline `ingest-dragonball-volumes.ts` (grayscale not verified equivalent to modulate).
- postgres (porsager): driver under drizzle-orm (`drizzle-orm/postgres-js`) in db, bot, pipeline, site, 100+ import sites; moving to Bun.sql needs a DB-backed test run.
- discord.js, discordx, @discordx/*, tsyringe, reflect-metadata: bot framework and DI decorators.
- @napi-rs/canvas: no Bun canvas API.
- sqlite-vec: loadable extension, no Bun equivalent.
- next, react, react-dom, next-intl, tiptap, codemirror, @base-ui/react and the rest of the site UI stack: runtime; site is moving to Leptos.
- @codemirror/state, @tiptap/pm, @tiptap/extension-drag-handle, prosemirror-transform, @next/env: peers or dedupe pins (next.config.ts).
- undici-types (bot, server): referenced by tsconfig `paths`.
- pino-pretty: bot logger transport target.
- zod, ai, @ai-sdk/*, better-auth, drizzle-orm, stripe, mediabunny, @modelcontextprotocol/sdk: no native equivalent.

Classic candidates (dotenv, node-fetch, axios, ws, uuid, bcrypt, jsonwebtoken, glob, chokidar, fs-extra, rimraf, cross-env, tsx, lodash, date-fns, yaml, node-cron, ioredis, better-sqlite3, semver, chalk, commander, execa, tar, form-data) are not direct dependencies of any package. `marked` (site, 1 import) was left: Bun.markdown output differs and the site is frozen.

## Tests (vps)

- packages/pipeline: 542 pass, 3 fail (all `bun:yolo` missing, identical on base), typecheck clean.
- packages/crunchyroll: 30 pass. packages/images: 18 pass.
- `bun audit`: 34 vulnerabilities (16 high, 15 moderate, 3 low), same as base; the fix is the claude-deps-js slice.
- Not run: bot tests (Bun.Image.rgba baseline), site tests.
