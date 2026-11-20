/* oxlint-disable eslint/no-shadow -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: MIT OR Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GLUE_FILE,
  OUT_DIR,
  STAMP_FILE,
  WASM_FILE,
  inputDigest,
  lockedWasmBindgenVersion,
  stampStatus,
  writeStamp,
  type Toolchain,
} from "../scripts/build-wasm.ts";
import {
  CANVAS_HANDLE_METHODS,
  preloadCanvasModule,
  resolveCanvasWasmAssetUrl,
} from "../src/canvas.ts";

const wasmPath = join(OUT_DIR, WASM_FILE);
const gluePath = join(OUT_DIR, GLUE_FILE);
const built = existsSync(wasmPath) && existsSync(gluePath);
// Sortie suivie par Git (`bun run build:wasm`) : absente seulement en cours de reconstruction.
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

describe("tampon de build-wasm.ts", () => {
  const roots: string[] = [];
  afterAll(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

  const lock = (bindgen = "0.2.129", unrelated = "1.0.0") =>
    [
      ["koharu-canvas", "0.83.5", ["koharu-rasterizer", "wasm-bindgen"]],
      ["koharu-rasterizer", "0.83.5", []],
      ["koharu-library", "0.83.5", ["tokio"]],
      ["tokio", unrelated, []],
      ["wasm-bindgen", bindgen, []],
    ]
      .map(
        ([name, version, dependencies]) =>
          `[[package]]\nname = "${name}"\nversion = "${version}"\n` +
          `dependencies = [${(dependencies as string[]).map((dep) => `"${dep}"`).join(", ")}]\n`,
      )
      .join("\n");
  const manifest = (tokio = "1.0.0") =>
    `[workspace]\nmembers = ["crates/*"]\n\n[workspace.dependencies]\n` +
    `tokio = "${tokio}"\nwasm-bindgen = "0.2.129"\n`;

  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "koharu-wasm-stamp-"));
    roots.push(root);
    const out = join(root, "out");
    // Bun.write crée les dossiers parents.
    const files: Record<string, string | Uint8Array> = {
      "Cargo.toml": manifest(),
      "Cargo.lock": lock(),
      [`out/${WASM_FILE}`]: new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
      [`out/${GLUE_FILE}`]: "export {};\n",
    };
    for (const crate of ["koharu-canvas", "koharu-rasterizer"]) {
      files[`crates/${crate}/Cargo.toml`] = `[package]\nname = "${crate}"\n`;
      files[`crates/${crate}/src/lib.rs`] = "pub fn f() {}\n";
      files[`crates/${crate}/README.md`] = "doc\n";
    }
    await Promise.all(
      Object.entries(files).map(([path, content]) => Bun.write(join(root, path), content)),
    );
    return { root, out };
  }

  const toolchain: Toolchain = { rustc: "rustc 1.98.1", wasmBindgen: "0.2.129" };

  test("lit la version de wasm-bindgen verrouillée", () => {
    const lock =
      '[[package]]\nname = "wasm-bindgen-futures"\nversion = "0.4.79"\n\n' +
      '[[package]]\nname = "wasm-bindgen"\nversion = "0.2.129"\n';
    expect(lockedWasmBindgenVersion(lock)).toBe("0.2.129");
    expect(() => lockedWasmBindgenVersion("")).toThrow(/wasm-bindgen/);
  });

  test("absent, frais, puis périmé selon les entrées, l'outillage et les sorties", async () => {
    const { root, out } = await fixture();
    expect(await stampStatus(root, out, toolchain)).toMatchObject({
      fresh: false,
      reason: "absent",
    });

    await writeStamp(out, toolchain, await inputDigest(root, toolchain));
    expect(existsSync(join(out, STAMP_FILE))).toBe(true);
    expect((await stampStatus(root, out, toolchain)).fresh).toBe(true);

    // Une documentation n'est pas une entrée du build.
    await Bun.write(join(root, "crates", "koharu-canvas", "README.md"), "autre doc\n");
    expect((await stampStatus(root, out, toolchain)).fresh).toBe(true);

    expect(await stampStatus(root, out, { ...toolchain, rustc: "rustc 1.99.0" })).toMatchObject({
      fresh: false,
      reason: "toolchain",
    });

    await Bun.write(join(root, "crates", "koharu-rasterizer", "src", "lib.rs"), "pub fn g() {}\n");
    expect(await stampStatus(root, out, toolchain)).toMatchObject({
      fresh: false,
      reason: "inputs",
    });

    await writeStamp(out, toolchain, await inputDigest(root, toolchain));
    // Hors du graphe de koharu-canvas : ni Cargo.lock ni Cargo.toml ne périment le WASM.
    await Bun.write(join(root, "Cargo.lock"), lock("0.2.129", "2.0.0"));
    await Bun.write(join(root, "Cargo.toml"), manifest("2.0.0"));
    expect((await stampStatus(root, out, toolchain)).fresh).toBe(true);
    await Bun.write(join(root, "Cargo.lock"), lock("0.2.130"));
    expect(await stampStatus(root, out, toolchain)).toMatchObject({ reason: "inputs" });

    await writeStamp(out, toolchain, await inputDigest(root, toolchain));
    await Bun.write(join(out, GLUE_FILE), "export const altered = true;\n");
    expect(await stampStatus(root, out, toolchain)).toMatchObject({ reason: "outputs" });
  });

  test("--check rend 0 ou 1 sans rien construire", { timeout: 60_000 }, async () => {
    const before = existsSync(wasmPath) ? (await stat(wasmPath)).mtimeMs : null;
    const check = Bun.spawnSync(
      [process.execPath, join(import.meta.dir, "..", "scripts", "build-wasm.ts"), "--check"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = `${check.stdout}${check.stderr}`;
    if (check.exitCode === 0) expect(output).toContain("à jour");
    else {
      expect(check.exitCode).toBe(1);
      expect(output).toMatch(/✗ (WASM koharu-canvas|Rust)/);
    }
    expect(existsSync(wasmPath) ? (await stat(wasmPath)).mtimeMs : null).toBe(before);

    const usage = Bun.spawnSync(
      [process.execPath, join(import.meta.dir, "..", "scripts", "build-wasm.ts"), "--nope"],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(usage.exitCode).toBe(2);
  });
});
