---
name: "bun"
description: "bun reference (CLI, runtime API, upstream docs), bun:ffi bridge to native C ABIs, zero-dependency / zero-bunx package rules with native replacements (Bun.SQL, bun:sqlite, Bun.S3Client, Bun.Image, Bun.serve, Bun.Glob, bun fmt, bun check, bun build --compile). Use BEFORE any choice of JS/TS tool, script, test, format, typecheck, bundling, FFI, SQL, shell, HTTP, or when writing package.json/tsconfig: bun replaces node, npm, npx, bunx, tsc, prettier, biome, oxlint, eslint, vite, vitest, jest, esbuild."
---

# bun

Rule: if bun does it, no third-party tool. Check below first, then the upstream docs.
Version: `bun --version` (the machine runs a canary; do not copy a version number into docs). Command list: `bun --help`; per command: `bun <command> --help`.

## Equivalents

- typecheck: `bun check` (not tsc/tsgo; native, all cores) · lint: `bun lint [--fix]` · format: `bun fmt`, `--check`, `--staged` (not prettier/biome)
- tests: `bun test` (not vitest/jest) · bundle: `bun build` · standalone executable: `bun compile` or `bun build --compile` (not vite/esbuild/pkg)
- JS/TS scripts and tooling: `Bun.$`, `Bun.spawn`, `fetch`, `Bun.Glob`, `Bun.file/write` (not node or pwsh). This rule covers JS/TS only: the language follows the domain (AGENTS.md section 4: Rust at the core, Python for ML, AI, research and reverse engineering, Go for deploy and cloud, C/C++ for C/C++ ecosystems).
- native: `bun:ffi` (dlopen, cc) · data: `bun:sqlite`, `Bun.SQL`, `Bun.redis`, `Bun.s3`

## Windows

- `bun upgrade` extracts with `powershell Expand-Archive` and ignores its exit code; launched from pwsh 7, Windows PowerShell inherits pwsh 7's `PSModulePath` and loads an incompatible Archive module (`MethodCountCouldNotFindBest`, then `Failed to verify Bun (code: ENOENT)`). Workaround: `PSModulePath= bun upgrade --canary`, or `ay rt install bun@canary` (also `ay rt run bun@canary -- x.ts`). Observed 2026-11-13 on a 1.4.4 and a canary binary; re-check on the binary in use.
- The `SHASUMS256.txt` of the `canary` release can lag behind republished archives: check the sha256 `digest` from the GitHub API.

## References

- [references/zero-dep.md](references/zero-dep.md): zero `bunx`, empty `dependencies`, `bun check` without `@types/bun`, canonical package.json/tsconfig, replacement table, code idioms, verification checklist.
- [references/ffi.md](references/ffi.md): `bun:ffi` bridge to the C ABI (`packages/core/src/ffi.ts`).
