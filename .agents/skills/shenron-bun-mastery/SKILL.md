---
name: shenron-bun-mastery
description: Canonical agent skill and operational playbook for Shenron (dragonballfr.com). Integrates AgentSkills.io, Vercel-Labs Skills, and Bun docs native systems to exploit 100% of Bun v1.4.4+ features across all monorepo layers (Bun.SQL, bun:sqlite, Bun.S3Client, Bun.Archive, Bun.Image, Bun.CSRF, Bun.cron, Bun.markdown, Bun.CryptoHasher, Bun.password, Bun.semver, Bun.color, Bun.Transpiler, bun:ffi, bun check, bun fmt, bun test, bun build --compile --bytecode).
---

# Shenron Bun Mastery (`shenron-bun-mastery`)

## 1. Context & Standard Compliance

This skill conforms to:

- **AgentSkills Specification** (`https://github.com/agentskills/agentskills`): Declarative frontmatter, actionable execution sections, idempotent verification steps.
- **Vercel Labs Skills Engineering** (`https://github.com/vercel-labs/skills`): Production edge ergonomics, type-safe API patterns, sub-millisecond execution.
- **Upstream Bun Docs Architecture** (`C:\src\third_party\bun\docs`): 1,413 canonical MDX specifications across runtime, bundler, compiler, test runner, linter, and formatter.
- **Sovereign Triad Directives**: `Linus Torvalds` (userspace integrity), `Jarred Sumner` (Full-Rust zero-dependency vertical speed), and `Larry Page` (ambient 10x clarity).

---

## 2. Monorepo Bun Features Matrix Across All Layers

| Layer                              | Traditional / Deprecated Pattern     | Sovereign Bun v1.4.4+ Feature                        | Verification                   |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| **Type Checking**                  | `tsc`, `tsc -b`, external ts package | `bun check` (Built-in multi-core Rust TypeScript 7)  | `just check`                   |
| **Formatting**                     | `prettier`, `biome`, `oxfmt`         | `bun fmt`                                            | `just format-check`            |
| **Linting**                        | `eslint`, `oxlint`                   | `bun lint`                                           | `just lint`                    |
| **Testing**                        | `jest`, `vitest`                     | `bun test` with built-in mocks and snapshot matching | `just test`                    |
| **Database (PostgreSQL)**          | `pg`, `postgres.js`, `prisma`        | `import { sql, SQL } from "bun"` (`Bun.SQL`)         | `apps/server`, `deploy/prod`   |
| **Database (Embedded/WAL)**        | `better-sqlite3`, `sqlite3`          | `import { Database } from "bun:sqlite"`              | `packages/bun-engine`          |
| **Cloud Object Storage (R2/S3)**   | `@aws-sdk/client-s3`, `aws4fetch`    | `new Bun.S3Client(...)`, `s3.file(...)`              | `scripts/ops/sync-site-cdn.ts` |
| **Container & Archives**           | `tar`, `archiver`, `decompress`      | `Bun.Archive` native stream reader/writer            | `packages/bun-engine`          |
| **Image Processing & ThumbHash**   | `sharp`, `jimp`                      | `Bun.Image`, `blob.image()` native WebP/AVIF         | `apps/site`, `apps/server`     |
| **Security & CSRF**                | `csurf`, `csrf-csrf`                 | `Bun.CSRF.generate()`, `Bun.CSRF.verify()`           | `apps/server`                  |
| **Task Scheduling & Cron**         | `node-cron`, `cron`                  | `Bun.cron(pattern, callback)`                        | `apps/server`, `apps/bot`      |
| **Markdown & MDX Compilation**     | `marked`, `markdown-it`              | `Bun.markdown.html()`, `Bun.markdown.render()`       | `apps/site`, `docs`            |
| **Hashing & Digests**              | `crypto.createHash`                  | `new Bun.CryptoHasher("blake2b256" \| "sha256")`     | `scripts/*`, `packages/*`      |
| **Password & Auth Hashing**        | `bcrypt`, `argon2`                   | `Bun.password.hash()`, `Bun.password.verify()`       | `apps/server`                  |
| **Semver & Version Matching**      | `semver` npm package                 | `Bun.semver.satisfies()`, `Bun.semver.order()`       | `scripts/deploy/*`             |
| **Terminal ANSI Styling**          | `chalk`, `picocolors`                | `Bun.color(str, format)`                             | `scripts/ops/*`                |
| **Transpilation & AST Code Gen**   | `@babel/core`, `esbuild`             | `new Bun.Transpiler({ loader: "tsx" })`              | `crates/bun-engine-core`       |
| **Systems Interop (Rust / C-ABI)** | `napi-rs`, `node-gyp`                | `import { dlopen, ptr } from "bun:ffi"`              | `crates/*`                     |
| **Binary Compilation**             | `pkg`, `nexe`, `caxa`                | `bun build --compile --bytecode`                     | Single binary artifacts        |

---

## 3. Operational Rules for Autonomous Agents

1. **Zero `bunx` Invocations**:
   - Never run `bunx <tool>` in Shenron. Use `bun <command>` or `just <recipe>`.
2. **Deterministic Workspace Type Checking**:
   - Always validate package modifications using `bun check`.
   - Never insert `"types": ["bun"]` into packages with empty `devDependencies` (use ambient headers).
3. **No External Network Leaks in CI / Production**:
   - Production Docker images stream layers over WireGuard via Zstandard (`zstd -T0`).
   - S3/R2 assets are mirrored through Pingora/Garage Edge Simulators.
4. **Strict Zero-Emoji Policy**:
   - Zero emojis in all code, comments, commit messages, and logs.
