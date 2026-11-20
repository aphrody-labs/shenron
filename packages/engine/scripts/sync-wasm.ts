#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Copies the WebGPU/wasm surface of `shenron-engine` (built in aphrody-labs/wiki) into
 * `src/wasm/`, which Git tracks so a clean tree has the module without Rust.
 *
 *   bun packages/engine/scripts/sync-wasm.ts [<wasm-bindgen output dir>]
 *
 * The source is the argument, else `SHENRON_ENGINE_WASM_DIR`, else `<wiki>/target/wasm/engine`
 * (`SHENRON_WIKI_DIR`, default `../wiki`). Nothing is compiled here.
 */
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { wikiDir } from "../../../scripts/build/wiki-artifacts.ts";

const outDir = join(import.meta.dir, "..", "src", "wasm");
const FILES = [
  "shenron_engine.js",
  "shenron_engine.d.ts",
  "shenron_engine_bg.wasm",
  "shenron_engine_bg.wasm.d.ts",
] as const;

try {
  const source = Bun.argv[2] ?? wikiDir("SHENRON_ENGINE_WASM_DIR", "target/wasm/engine");
  const missing = FILES.filter((file) => !Bun.file(join(source, file)).size);
  if (missing.length) throw new Error(`${source} lacks ${missing.join(", ")}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const file of FILES) await copyFile(join(source, file), join(outDir, file));
  console.log(`shenron-engine wasm synced from ${source} to ${outDir}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
