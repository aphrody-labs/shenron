#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Compiles `crates/shenron-re` to WebAssembly (`wasm32-unknown-unknown`)
 * and generates web bindings via `wasm-bindgen`.
 *
 *   bun packages/pipeline/scripts/build-re-wasm.ts
 */

import { existsSync } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const CRATE = "shenron-re";
const TARGET = "wasm32-unknown-unknown";
const OUT_DIR = join(ROOT, "packages", "pipeline", "src", "wasm");
const PKG_DIR = join(ROOT, "crates", "shenron-re", "pkg");

console.log(`▶ Building ${CRATE} for ${TARGET} in release mode...`);
const cargo = Bun.spawnSync(["cargo", "build", "-p", CRATE, "--target", TARGET, "--release"], {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});

if (cargo.exitCode !== 0) {
  console.error("✗ Cargo build failed");
  process.exit(1);
}

const wasmPath = join(ROOT, "target", TARGET, "release", "shenron_re.wasm");
if (!existsSync(wasmPath)) {
  console.error(`✗ Output binary not found at ${wasmPath}`);
  process.exit(1);
}

console.log(`▶ Running wasm-bindgen on ${wasmPath}...`);
const bindgen = Bun.spawnSync(["wasm-bindgen", wasmPath, "--out-dir", PKG_DIR, "--target", "web"], {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});

if (bindgen.exitCode !== 0) {
  console.error("✗ wasm-bindgen failed");
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
for (const file of [
  "shenron_re.d.ts",
  "shenron_re.js",
  "shenron_re_bg.wasm",
  "shenron_re_bg.wasm.d.ts",
]) {
  await copyFile(join(PKG_DIR, file), join(OUT_DIR, file));
}

console.log(`✓ shenron-re WASM pipeline built and staged to ${OUT_DIR}`);
