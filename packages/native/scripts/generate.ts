#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Copies `src/generated/symbols.ts` (the `bun:ffi` table, from `abi::SYMBOLS`) and
 * `src/generated/types.ts` (the JSON payloads, from `shenron-ffi` through specta). Rust is the one
 * source of both and the `typescript` test of the crate, run in aphrody-labs/wiki, writes them.
 *
 *   bun packages/native/scripts/generate.ts [<dir>]           copy the files
 *   bun packages/native/scripts/generate.ts [<dir>] --check   fail when a committed file is stale
 *
 * The directory is the argument, else `SHENRON_NATIVE_GENERATED_DIR`, else
 * `<wiki>/crates/shenron-ffi/generated` (`SHENRON_WIKI_DIR`, default `../wiki`).
 */
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { wikiDir } from "../../../scripts/build/wiki-artifacts.ts";

const outDir = join(import.meta.dir, "..", "src", "generated");
const FILES = ["symbols.ts", "types.ts"] as const;
const check = Bun.argv.includes("--check");

try {
  const source =
    Bun.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    wikiDir("SHENRON_NATIVE_GENERATED_DIR", "crates/shenron-ffi/generated");
  const missing = FILES.filter((file) => !Bun.file(join(source, file)).size);
  if (missing.length) throw new Error(`${source} lacks ${missing.join(", ")}`);
  if (check) {
    const stale: string[] = [];
    for (const file of FILES) {
      const [fresh, committed] = await Promise.all([
        Bun.file(join(source, file)).text(),
        Bun.file(join(outDir, file)).text(),
      ]);
      if (fresh.replaceAll("\r\n", "\n") !== committed.replaceAll("\r\n", "\n")) stale.push(file);
    }
    if (stale.length) {
      console.error(`packages/native/src/generated is stale (${stale.join(", ")}): run bun packages/native/scripts/generate.ts`);
      process.exit(1);
    }
    console.error("generated TypeScript is current");
  } else {
    await mkdir(outDir, { recursive: true });
    for (const file of FILES) await copyFile(join(source, file), join(outDir, file));
    console.error(`packages/native/src/generated rewritten from ${source}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
