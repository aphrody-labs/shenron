#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Builds the WebGPU/wasm surface of `crates/shenron-engine` (feature `wasm`, no Vello) into
 * `src/wasm/`, which Git tracks so a clean tree has the module without Rust.
 *
 *   bun packages/engine/scripts/build-wasm.ts
 *
 * Cargo is heavy: run it on the build host (the VPS factory), then copy `src/wasm/` back.
 * `bun wasm build` runs cargo for wasm32-unknown-unknown, wasm-bindgen (`--target web`) and
 * `wasm-opt -Oz`.
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..", "..");
const outdir = join(import.meta.dir, "..", "src", "wasm");
const run = Bun.spawnSync(
  [
    process.execPath,
    "wasm",
    "build",
    "--package",
    "shenron-engine",
    "--no-default-features",
    "--features",
    "wasm",
    "--no-pack",
    "--outdir",
    outdir,
  ],
  { cwd: root, stdout: "inherit", stderr: "inherit" },
);
process.exit(run.exitCode ?? 1);
