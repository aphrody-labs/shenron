#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Stages the Bevy game of dragon-pixel for the browser like the Gecko build: content-hashed names,
 * the glue rewritten to the hashed wasm and a generated manifest the site imports. The module is
 * built in aphrody-labs/wiki (cargo for wasm32-unknown-unknown with the `bevy` feature,
 * `wasm-bindgen --target web --no-typescript --out-name dragon_pixel`, `wasm-opt -Oz`); this
 * script never builds it.
 *
 *   bun scripts/ops/stage-dragon-pixel-wasm.ts [<build dir>]
 *
 * The build dir holds `dragon_pixel.js`, `dragon_pixel_bg.wasm` (straight out of wasm-bindgen) and
 * optionally `dragon_pixel_bg.opt.wasm` (after wasm-opt). It is the argument, else
 * `SHENRON_DRAGON_PIXEL_WASM_DIR`, else `<wiki>/target/wasm/dragon-pixel` (`SHENRON_WIKI_DIR`,
 * default `../wiki`). Options: --out <dir> (default apps/site/public/wasm/dragon-pixel),
 * --manifest <file>, --source-rev <sha> (default: HEAD of the wiki checkout).
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WIKI_DIR, wikiDir } from "../build/wiki-artifacts";
import {
  type DragonPixelManifest,
  MANIFEST_PATH,
  OUT_NAME,
  PUBLIC_DIR,
  hashedName,
  manifestSource,
  sha256,
} from "./dragon-pixel-wasm-files";

const root = resolve(import.meta.dir, "../..");
const option = (name: string): string | undefined => {
  const index = Bun.argv.indexOf(name);
  return index > 0 ? Bun.argv[index + 1] : undefined;
};
const outDir = resolve(root, option("--out") ?? PUBLIC_DIR);
const manifestFile = resolve(root, option("--manifest") ?? MANIFEST_PATH);
const positional = Bun.argv.slice(2).find((arg, index, all) => {
  return !arg.startsWith("--") && !all[index - 1]?.startsWith("--");
});

const source = positional
  ? resolve(positional)
  : wikiDir("SHENRON_DRAGON_PIXEL_WASM_DIR", "target/wasm/dragon-pixel");
const rawFile = join(source, `${OUT_NAME}_bg.wasm`);
const optimizedFile = join(source, `${OUT_NAME}_bg.opt.wasm`);
const gluePath = join(source, `${OUT_NAME}.js`);
for (const file of [rawFile, gluePath]) {
  if (!(await Bun.file(file).exists()))
    throw new Error(`${file} is missing: build dragon-pixel in aphrody-labs/wiki first`);
}

const raw = new Uint8Array(await Bun.file(rawFile).arrayBuffer());
const wasm = (await Bun.file(optimizedFile).exists())
  ? new Uint8Array(await Bun.file(optimizedFile).arrayBuffer())
  : raw;
if (wasm.length < 1_000_000 || wasm[0] !== 0x00 || wasm[1] !== 0x61 || wasm[2] !== 0x73)
  throw new Error("the module is missing or not a WebAssembly module");

const wasmSha = sha256(wasm);
const wasmName = hashedName(`${OUT_NAME}_bg`, "wasm", wasmSha);
const glue = await Bun.file(gluePath).text();
if (!glue.includes(`${OUT_NAME}_bg.wasm`))
  throw new Error(`the glue does not reference ${OUT_NAME}_bg.wasm`);
const patched = new TextEncoder().encode(glue.replaceAll(`${OUT_NAME}_bg.wasm`, wasmName));
const jsName = hashedName(OUT_NAME, "js", sha256(patched));

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await Bun.write(join(outDir, wasmName), wasm);
await Bun.write(join(outDir, jsName), patched);

const gitRevision = await Bun.$`git -C ${WIKI_DIR} rev-parse --short HEAD`.nothrow().quiet().text();
const manifest: DragonPixelManifest = {
  js: `dragon-pixel/${jsName}`,
  wasm: `dragon-pixel/${wasmName}`,
  wasmSha256: wasmSha,
  wasmBytes: wasm.length,
  rawBytes: raw.length,
  sourceRevision: option("--source-rev") ?? (gitRevision.trim() || "unknown"),
};
await Bun.write(manifestFile, manifestSource(manifest));
console.log(JSON.stringify({ ...manifest, staged: await readdir(outDir) }));
