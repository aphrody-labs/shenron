/* oxlint-disable eslint/no-shadow -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: MIT OR Apache-2.0
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { GLUE_FILE, OUT_DIR, WASM_FILE } from "../scripts/sync-wasm.ts";
import {
  CANVAS_HANDLE_METHODS,
  preloadCanvasModule,
  resolveCanvasWasmAssetUrl,
} from "../src/canvas.ts";

const wasmPath = join(OUT_DIR, WASM_FILE);
const gluePath = join(OUT_DIR, GLUE_FILE);
const built = existsSync(wasmPath) && existsSync(gluePath);
// Sortie suivie par Git (`bun run sync:wasm`, construite dans aphrody-labs/wiki).
const withWasm = test.skipIf(!built);

interface Glue {
  createCanvas: unknown;
  default: unknown;
  initSync: unknown;
  WebCanvas: { prototype: Record<string, unknown> };
}

describe("module WASM de koharu-canvas (WebAssembly natif de Bun)", () => {
  test("garde le WASM Turbopack sur l'origine du site malgré les chunks Next sur CDN", () => {
    const asset = new URL(
      "/_next/static/media/koharu_canvas_bg.abc123.wasm",
      "https://dragonballfr.com",
    );
    const url = resolveCanvasWasmAssetUrl(asset, "https://dragonballfr.com", [
      "https://cdn.dragonballfr.com/_next/static/chunks/app.js",
    ]);
    expect(url.href).toBe(
      "https://dragonballfr.com/_next/static/media/koharu_canvas_bg.abc123.wasm",
    );
  });

  test("préserve le chemin haché, la requête et l'ancre sans suivre un préfixe CDN", () => {
    const asset = new URL("/_next/static/media/canvas.wasm", "https://dragonballfr.com");
    expect(
      resolveCanvasWasmAssetUrl(asset, "https://dragonballfr.com", [
        "https://cdn.example.test/site/_next/static/chunks/app.js",
      ]).href,
    ).toBe("https://dragonballfr.com/_next/static/media/canvas.wasm");
    const versioned = new URL("/_next/static/media/canvas.abc123.wasm?v=4#module", asset);
    expect(resolveCanvasWasmAssetUrl(versioned, "https://dragonballfr.com").href).toBe(
      "https://dragonballfr.com/_next/static/media/canvas.abc123.wasm?v=4#module",
    );
  });

  withWasm("valide et compile", async () => {
    const bytes = await Bun.file(wasmPath).bytes();
    expect(WebAssembly.validate(bytes)).toBe(true);
    const module = await WebAssembly.compile(bytes);
    // wasm-bindgen --remove-name-section --remove-producers-section
    expect(WebAssembly.Module.customSections(module, "name")).toHaveLength(0);
    expect(WebAssembly.Module.customSections(module, "producers")).toHaveLength(0);
  });

  withWasm("exporte createCanvas et chaque méthode de CanvasHandle", async () => {
    const module = await WebAssembly.compile(await Bun.file(wasmPath).bytes());
    const exports = new Set(WebAssembly.Module.exports(module).map((entry) => entry.name));
    expect(exports.has("memory")).toBe(true);
    expect(exports.has("createCanvas")).toBe(true);
    expect(exports.has("__wbg_webcanvas_free")).toBe(true);
    const missing = CANVAS_HANDLE_METHODS.filter(
      (method) => method !== "free" && !exports.has(`webcanvas_${method}`),
    );
    expect(missing).toEqual([]);
  });

  withWasm("la glue générée expose le contrat de canvas.ts", async () => {
    const glue = (await import(gluePath)) as Glue;
    expect(typeof glue.default).toBe("function");
    expect(typeof glue.initSync).toBe("function");
    expect(typeof glue.createCanvas).toBe("function");
    const missing = CANVAS_HANDLE_METHODS.filter(
      (method) => typeof glue.WebCanvas.prototype[method] !== "function",
    );
    expect(missing).toEqual([]);
  });

  withWasm("chaque import du module est fourni par la glue", async () => {
    const module = await WebAssembly.compile(await Bun.file(wasmPath).bytes());
    const imports = WebAssembly.Module.imports(module);
    expect(new Set(imports.map((entry) => entry.module))).toEqual(
      new Set([`./${GLUE_FILE.replace(/\.js$/, "_bg.js")}`]),
    );
    const glue = await Bun.file(gluePath).text();
    const absent = imports.filter((entry) => !glue.includes(`${entry.name}:`));
    expect(absent.map((entry) => entry.name)).toEqual([]);
  });

  withWasm("preloadCanvasModule compile, lie et instancie le module", async () => {
    // fetch(file://) puis WebAssembly.compileStreaming ou compile, puis l'init de la glue :
    // une incohérence d'imports échouerait ici en LinkError.
    expect(await preloadCanvasModule()).toBe(true);
  });
});
