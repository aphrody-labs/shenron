#!/usr/bin/env bun
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Copies the WebGPU viewport of Koharu (`koharu-canvas`, built in aphrody-labs/wiki) into
 * `src/wasm/`, which Git tracks so a clean tree has the module without Rust.
 *
 *   bun packages/koharu/scripts/sync-wasm.ts [<wasm-bindgen output dir>]
 *
 * The source is the argument, else `SHENRON_KOHARU_WASM_DIR`, else `<wiki>/target/wasm/bindgen`
 * (`SHENRON_WIKI_DIR`, default `../wiki`). Nothing is compiled here.
 */
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { wikiDir } from "@aphrody/shenron-config/wiki-artifacts";

export const OUT_DIR = join(import.meta.dir, "..", "src", "wasm");
export const OUT_NAME = "koharu_canvas";
export const WASM_FILE = `${OUT_NAME}_bg.wasm`;
export const GLUE_FILE = `${OUT_NAME}.js`;
const FILES = [GLUE_FILE, `${OUT_NAME}.d.ts`, WASM_FILE, `${WASM_FILE}.d.ts`] as const;

export async function syncWasm(source: string, outDir = OUT_DIR): Promise<void> {
  const missing = FILES.filter((file) => !Bun.file(join(source, file)).size);
  if (missing.length) throw new Error(`${source} lacks ${missing.join(", ")}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const file of FILES) await copyFile(join(source, file), join(outDir, file));
}

if (import.meta.main) {
  try {
    const source =
      Bun.argv[2] ?? wikiDir("SHENRON_KOHARU_WASM_DIR", "target/wasm/bindgen", "target/wasm");
    await syncWasm(source);
    console.log(`koharu-canvas wasm synced from ${source} to ${OUT_DIR}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
