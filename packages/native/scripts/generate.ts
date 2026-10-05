#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Generate `src/generated/symbols.ts` (the `bun:ffi` table, from `abi::SYMBOLS`) and
 * `src/generated/types.ts` (the JSON payloads, from `crates/shenron-ffi/src/types.rs` through
 * specta) with the `typescript` test of the crate: Rust is the one source of both.
 *
 *   bun packages/native/scripts/generate.ts           rewrite the files (UPDATE=1)
 *   bun packages/native/scripts/generate.ts --check   fail when a committed file is stale
 *
 * `cargo test -p shenron-ffi` runs the same check.
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..", "..");
const check = Bun.argv.includes("--check");

const cargo = Bun.spawn(["cargo", "test", "--quiet", "-p", "shenron-ffi", "--test", "typescript"], {
  cwd: root,
  env: { ...process.env, UPDATE: check ? "0" : "1" },
  stdout: "inherit",
  stderr: "inherit",
});
const code = await cargo.exited;
if (code !== 0) {
  console.error(
    check
      ? "packages/native/src/generated is stale: run `bun packages/native/scripts/generate.ts`"
      : "generation failed (cargo test -p shenron-ffi --test typescript)",
  );
  process.exit(code);
}
console.error(
  check ? "generated TypeScript is current" : "packages/native/src/generated rewritten",
);
