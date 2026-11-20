// SPDX-License-Identifier: Apache-2.0
/**
 * Gate of the Dragon Pixel wasm: the loader may only reference files and exports that the build
 * produces. The Rust-side checks run when the wiki checkout (SHENRON_WIKI_DIR, default ../wiki) is
 * next to this repository; the staged-file checks run when the build output exists
 * and become mandatory with DRAGON_PIXEL_WASM_STRICT=1 (`just dragon-pixel-wasm-check`).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  OUT_NAME,
  PUBLIC_DIR,
  STAGE_DIR,
  isHashedName,
  sha256,
} from "../../../scripts/ops/dragon-pixel-wasm-files";
import { WIKI_DIR } from "../../../scripts/build/wiki-artifacts";
import { DRAGON_PIXEL_WASM } from "../src/lib/dragon-pixel-wasm.generated";

const REPO = join(import.meta.dir, "..", "..", "..");
const SITE = join(import.meta.dir, "..");
const read = (path: string): string => readFileSync(path, "utf8");
const strict = process.env.DRAGON_PIXEL_WASM_STRICT === "1";

const loaderSource = read(join(SITE, "src/lib/dragon-pixel-loader.ts"));
const consumers = [
  loaderSource,
  read(join(SITE, "src/lib/dragon-pixel-canvas.ts")),
  read(join(SITE, "src/components/games/DragonPixelArena.tsx")),
];

/** Names the loader expects from the glue, read from its `DragonPixelBindings` interface. */
function expectedExports(): { functions: string[]; classes: string[] } {
  const block = /export interface DragonPixelBindings \{([\s\S]*?)\n\}/.exec(loaderSource)?.[1];
  if (!block) throw new Error("DragonPixelBindings interface not found in the loader");
  const functions = [...block.matchAll(/^ {2}(\w+)\(/gm)].map((match) => match[1]!);
  const classes = [...block.matchAll(/^ {2}(\w+): new \(/gm)].map((match) => match[1]!);
  return { functions, classes };
}

describe("manifest", () => {
  test("names are content-hashed files of the staging directory", () => {
    for (const path of [DRAGON_PIXEL_WASM.js, DRAGON_PIXEL_WASM.wasm]) {
      expect(path.startsWith(`${STAGE_DIR}/`)).toBe(true);
      expect(isHashedName(basename(path))).toBe(true);
    }
    expect(basename(DRAGON_PIXEL_WASM.wasm).startsWith(`${OUT_NAME}_bg.`)).toBe(true);
    expect(DRAGON_PIXEL_WASM.wasmSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(basename(DRAGON_PIXEL_WASM.wasm)).toContain(DRAGON_PIXEL_WASM.wasmSha256.slice(0, 16));
    expect(DRAGON_PIXEL_WASM.wasmBytes).toBeGreaterThan(1_000_000);
    expect(DRAGON_PIXEL_WASM.rawBytes).toBeGreaterThanOrEqual(DRAGON_PIXEL_WASM.wasmBytes);
  });

  test("the loader and its views take file names from the manifest only", () => {
    expect(loaderSource).toContain("DRAGON_PIXEL_WASM");
    for (const source of consumers) {
      expect(source).not.toMatch(/["'`][^"'`\n]*\.wasm["'`]/);
      expect(source).not.toMatch(/["'`][^"'`\n]*dragon_pixel[^"'`\n]*\.js["'`]/);
    }
  });
});

describe("rust exports", () => {
  const rustFiles = ["bevy_view.rs", "wasm.rs"].map((name) =>
    join(WIKI_DIR, "crates/dragon-pixel/src", name),
  );
  test.skipIf(!rustFiles.every((file) => existsSync(file)))(
    "every binding the loader declares is exported by crates/dragon-pixel (aphrody-labs/wiki)",
    () => {
      const rust = rustFiles.map(read).join("\n");
      const { functions, classes } = expectedExports();
      expect(functions.length).toBeGreaterThan(4);
      for (const name of functions) expect(rust).toMatch(new RegExp(`pub fn ${name}\\(`));
      for (const name of classes) expect(rust).toMatch(new RegExp(`pub struct ${name}\\b`));
    },
  );
});

describe("staged build", () => {
  const directory = join(REPO, PUBLIC_DIR);
  const wasmFile = join(REPO, "apps/site/public/wasm", DRAGON_PIXEL_WASM.wasm);
  const jsFile = join(REPO, "apps/site/public/wasm", DRAGON_PIXEL_WASM.js);
  const staged = existsSync(wasmFile) && existsSync(jsFile);

  test("the build output exists when the gate is strict", () => {
    if (strict) expect(existsSync(directory)).toBe(true);
    if (strict) expect(staged).toBe(true);
  });

  test.skipIf(!staged)("the staged wasm matches the manifest", () => {
    const bytes = new Uint8Array(readFileSync(wasmFile));
    expect(bytes.length).toBe(DRAGON_PIXEL_WASM.wasmBytes);
    expect(sha256(bytes)).toBe(DRAGON_PIXEL_WASM.wasmSha256);
  });

  test.skipIf(!staged)(
    "the staged glue loads the hashed wasm and exports what the loader uses",
    () => {
      const glue = read(jsFile);
      expect(glue).toContain(basename(DRAGON_PIXEL_WASM.wasm));
      const { functions, classes } = expectedExports();
      for (const name of functions) expect(glue).toMatch(new RegExp(`export function ${name}\\(`));
      for (const name of classes) expect(glue).toMatch(new RegExp(`export class ${name}\\b`));
    },
  );
});
