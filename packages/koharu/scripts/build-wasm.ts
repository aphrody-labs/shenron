#!/usr/bin/env bun
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Construit le viewport WebGPU de Koharu (`crates/koharu-canvas`) en WASM avec le seul outillage
 * Rust : `cargo build --target wasm32-unknown-unknown` puis le CLI `wasm-bindgen` (glue ES
 * `--target web`), sans wasm-pack ni binaryen.
 *
 *   bun packages/koharu/scripts/build-wasm.ts           # reconstruit si une entrée a changé
 *   bun packages/koharu/scripts/build-wasm.ts --force   # reconstruit sans consulter le tampon
 *   bun packages/koharu/scripts/build-wasm.ts --check   # code 1 si la sortie est absente ou périmée
 *
 * Sortie : `packages/koharu/src/wasm/` (ignorée par Git), lue par `src/canvas.ts`. Le tampon
 * `.build-stamp.json` y garde l'empreinte des entrées (sources de koharu-canvas et
 * koharu-rasterizer, manifestes, Cargo.lock, recette, rustc, wasm-bindgen) et des sorties.
 *
 * Outillage assuré sans root et de façon idempotente : cible `wasm32-unknown-unknown` (rustup)
 * et CLI `wasm-bindgen` de la version exacte de la crate dans Cargo.lock, installé au besoin par
 * `cargo install --locked` dans une racine propre à la version (le binaire global n'est pas
 * remplacé). Profil optimisé passé par `CARGO_PROFILE_RELEASE_*`, dossier cible `target/wasm`.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";

export const ROOT = join(import.meta.dir, "..", "..", "..");
export const OUT_DIR = join(ROOT, "packages", "koharu", "src", "wasm");
export const OUT_NAME = "koharu_canvas";
export const WASM_FILE = `${OUT_NAME}_bg.wasm`;
export const GLUE_FILE = `${OUT_NAME}.js`;
export const STAMP_FILE = ".build-stamp.json";
const TARGET = "wasm32-unknown-unknown";
const CRATE = "koharu-canvas";
const SCHEMA = "shenron-koharu-wasm/v1";

/** Profil release du seul build WASM : Cargo.toml (partagé) reste intact. */
export const PROFILE: Readonly<Record<string, string>> = {
  CARGO_PROFILE_RELEASE_OPT_LEVEL: "3",
  CARGO_PROFILE_RELEASE_LTO: "fat",
  CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "1",
  // wasm32-unknown-unknown n'a pas de déroulement de pile : abort est déjà sa stratégie.
  CARGO_PROFILE_RELEASE_PANIC: "abort",
  CARGO_PROFILE_RELEASE_DEBUG: "false",
  // Pas `symbols` : `--strip-all` ôterait la section `target_features` d'où wasm-bindgen déduit
  // les reference types (externref) ; les sections nom et producteurs tombent à wasm-bindgen.
  CARGO_PROFILE_RELEASE_STRIP: "debuginfo",
  CARGO_PROFILE_RELEASE_INCREMENTAL: "false",
};
const BINDGEN_FLAGS = [
  "--target",
  "web",
  "--out-name",
  OUT_NAME,
  // canvas.ts compile lui-même le module (streaming) : la glue ne porte pas d'URL par défaut.
  "--omit-default-module-path",
  "--remove-name-section",
  "--remove-producers-section",
] as const;
/** Toute modification de la recette périme le tampon. */
export const RECIPE = JSON.stringify({ schema: SCHEMA, target: TARGET, PROFILE, BINDGEN_FLAGS });

/** Sources dont dépend le WASM, relatives à la racine du dépôt. */
export const INPUT_ROOTS = ["crates/koharu-canvas", "crates/koharu-rasterizer"] as const;

export interface Toolchain {
  /** Sortie de `rustc -vV`. */
  rustc: string;
  /** Version de la crate wasm-bindgen verrouillée, égale à celle du CLI. */
  wasmBindgen: string;
}

export interface Stamp {
  schema: string;
  inputs: string;
  rustc: string;
  wasmBindgen: string;
  outputs: Record<string, string>;
  wasmBytes: number;
  builtAt: string;
}

export type StampStatus =
  | { fresh: true; stamp: Stamp }
  | { fresh: false; reason: "absent" | "inputs" | "outputs" | "toolchain"; detail: string };

export function lockedWasmBindgenVersion(lock: string): string {
  const match = /\[\[package\]\]\r?\nname = "wasm-bindgen"\r?\nversion = "([^"]+)"/.exec(lock);
  if (!match) throw new Error("Cargo.lock ne verrouille aucune crate wasm-bindgen");
  return match[1]!;
}

/** Fichiers d'entrée triés : manifeste, `build.rs` et `src/**` de chaque crate. */
export async function inputFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const crate of INPUT_ROOTS) {
    for (const name of ["Cargo.toml", "build.rs"]) {
      if (existsSync(join(root, crate, name))) files.push(`${crate}/${name}`);
    }
    const src = join(root, crate, "src");
    if (!existsSync(src)) continue;
    for (const path of new Bun.Glob("**/*").scanSync({ cwd: src, onlyFiles: true, dot: true })) {
      files.push(`${crate}/src/${path.replaceAll("\\", "/")}`);
    }
  }
  return files.toSorted();
}

interface LockPackage {
  name: string;
  version: string;
  source?: string;
  checksum?: string;
  dependencies?: string[];
}

/**
 * Paquets de Cargo.lock atteignables depuis `roots` (nom, version, source, somme) : un
 * changement de dépendance ailleurs dans le workspace ne périme pas le WASM.
 */
export function lockClosure(lock: string, roots: readonly string[]): string[] {
  const packages = (Bun.TOML.parse(lock) as { package?: LockPackage[] }).package ?? [];
  const byName = Map.groupBy(packages, (entry) => entry.name);
  const resolve = (spec: string) => {
    const [name, version] = spec.split(" ");
    const candidates = byName.get(name!) ?? [];
    return version ? candidates.filter((entry) => entry.version === version) : candidates;
  };
  const seen = new Set<LockPackage>();
  const queue = roots.flatMap(resolve);
  while (queue.length) {
    const entry = queue.pop()!;
    if (seen.has(entry)) continue;
    seen.add(entry);
    queue.push(...(entry.dependencies ?? []).flatMap(resolve));
  }
  return [...seen]
    .map((entry) => [entry.name, entry.version, entry.source ?? "", entry.checksum ?? ""].join(" "))
    .toSorted();
}

/** Ce que le Cargo.toml racine impose au build : dépendances du graphe, patchs, profils, lints. */
export function manifestSubset(manifest: string, names: ReadonlySet<string>): string {
  const toml = Bun.TOML.parse(manifest) as {
    workspace?: { dependencies?: Record<string, unknown>; lints?: unknown; package?: unknown };
    patch?: unknown;
    profile?: unknown;
  };
  const dependencies = Object.entries(toml.workspace?.dependencies ?? {})
    .filter(([key, spec]) => {
      const renamed = (spec as { package?: unknown } | null)?.package;
      return names.has(typeof renamed === "string" ? renamed : key);
    })
    .toSorted(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({
    dependencies,
    patch: toml.patch ?? null,
    profile: toml.profile ?? null,
    lints: toml.workspace?.lints ?? null,
    package: toml.workspace?.package ?? null,
  });
}

export async function inputDigest(root: string, toolchain: Toolchain): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${RECIPE}\0${toolchain.rustc}\0${toolchain.wasmBindgen}\0`);
  const files = await inputFiles(root);
  const contents = await Promise.all(files.map((file) => Bun.file(join(root, file)).bytes()));
  files.forEach((file, index) => hasher.update(`${file}\0`).update(contents[index]!).update("\0"));
  const lock = lockClosure(await Bun.file(join(root, "Cargo.lock")).text(), [CRATE]);
  hasher.update(`Cargo.lock\0${lock.join("\n")}\0`);
  const names = new Set(lock.map((entry) => entry.split(" ", 1)[0]!));
  const manifest = manifestSubset(await Bun.file(join(root, "Cargo.toml")).text(), names);
  hasher.update(`Cargo.toml\0${manifest}\0`);
  return hasher.digest("hex");
}

async function fileDigest(path: string): Promise<string> {
  return new Bun.CryptoHasher("sha256").update(await Bun.file(path).bytes()).digest("hex");
}

export async function readStamp(outDir: string): Promise<Stamp | null> {
  const file = Bun.file(join(outDir, STAMP_FILE));
  if (!(await file.exists())) return null;
  try {
    const stamp = (await file.json()) as Stamp;
    return stamp.schema === SCHEMA ? stamp : null;
  } catch {
    return null;
  }
}

/** Écrit le tampon d'une sortie produite à partir des entrées d'empreinte `inputs`. */
export async function writeStamp(
  outDir: string,
  toolchain: Toolchain,
  inputs: string,
): Promise<Stamp> {
  const names = (await readdir(outDir)).filter((name) => !name.startsWith(".")).toSorted();
  const digests = await Promise.all(names.map((name) => fileDigest(join(outDir, name))));
  const outputs = Object.fromEntries(names.map((name, index) => [name, digests[index]!]));
  if (!outputs[WASM_FILE] || !outputs[GLUE_FILE])
    throw new Error(`sortie incomplète : ${WASM_FILE} et ${GLUE_FILE} attendus dans ${outDir}`);
  const stamp: Stamp = {
    schema: SCHEMA,
    inputs,
    rustc: toolchain.rustc,
    wasmBindgen: toolchain.wasmBindgen,
    outputs,
    wasmBytes: Bun.file(join(outDir, WASM_FILE)).size,
    builtAt: new Date().toISOString(),
  };
  await Bun.write(join(outDir, STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

export async function stampStatus(
  root: string,
  outDir: string,
  toolchain: Toolchain,
): Promise<StampStatus> {
  const stamp = await readStamp(outDir);
  if (!stamp)
    return { fresh: false, reason: "absent", detail: `${STAMP_FILE} absent ou illisible` };
  const outputs = Object.entries(stamp.outputs);
  const missing = outputs.find(([name]) => !existsSync(join(outDir, name)));
  if (missing) return { fresh: false, reason: "absent", detail: `${missing[0]} absent` };
  const digests = await Promise.all(outputs.map(([name]) => fileDigest(join(outDir, name))));
  const altered = outputs.find(([, digest], index) => digests[index] !== digest);
  if (altered)
    return { fresh: false, reason: "outputs", detail: `${altered[0]} modifié depuis le build` };
  if (!stamp.outputs[WASM_FILE] || !stamp.outputs[GLUE_FILE])
    return { fresh: false, reason: "absent", detail: "tampon sans sortie WASM ni glue" };
  if (stamp.rustc !== toolchain.rustc || stamp.wasmBindgen !== toolchain.wasmBindgen)
    return {
      fresh: false,
      reason: "toolchain",
      detail: `outillage changé (wasm-bindgen ${stamp.wasmBindgen} → ${toolchain.wasmBindgen})`,
    };
  if (stamp.inputs !== (await inputDigest(root, toolchain)))
    return { fresh: false, reason: "inputs", detail: "sources, manifestes ou Cargo.lock modifiés" };
  return { fresh: true, stamp };
}

function run(cmd: string[], env: Record<string, string> = {}, quiet = false): string {
  const result = Bun.spawnSync(cmd, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: quiet ? "pipe" : "inherit",
  });
  if (result.exitCode !== 0) {
    const detail = quiet ? `\n${result.stderr?.toString().trim() ?? ""}` : "";
    throw new Error(`${cmd.join(" ")} : code ${result.exitCode}${detail}`);
  }
  return result.stdout.toString();
}

function rustc(): string {
  if (!Bun.which("rustc") || !Bun.which("cargo"))
    throw new Error("Rust (rustc, cargo) introuvable : installer rustup (https://rustup.rs)");
  return run(["rustc", "-vV"], {}, true).trim();
}

function ensureTarget(install: boolean): void {
  const sysroot = run(["rustc", "--print", "sysroot"], {}, true).trim();
  if (existsSync(join(sysroot, "lib", "rustlib", TARGET))) return;
  if (!install) throw new Error(`cible Rust ${TARGET} absente`);
  if (!Bun.which("rustup"))
    throw new Error(`cible Rust ${TARGET} absente et rustup introuvable pour l'ajouter`);
  console.log(`▶ rustup target add ${TARGET}`);
  run(["rustup", "target", "add", TARGET]);
}

function bindgenVersion(binary: string): string | null {
  const result = Bun.spawnSync([binary, "--version"], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) return null;
  return /wasm-bindgen (\S+)/.exec(result.stdout.toString())?.[1] ?? null;
}

/** Racine d'installation propre à une version : n'écrase jamais le wasm-bindgen global. */
export function bindgenRoot(version: string): string {
  const cache = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(cache, "shenron", "tools", `wasm-bindgen-cli-${version}`);
}

function ensureWasmBindgen(version: string): string {
  const pinned = join(bindgenRoot(version), "bin", "wasm-bindgen");
  for (const candidate of [process.env.WASM_BINDGEN, Bun.which("wasm-bindgen"), pinned]) {
    if (candidate && existsSync(candidate) && bindgenVersion(candidate) === version)
      return candidate;
  }
  console.log(`▶ cargo install wasm-bindgen-cli ${version} --locked → ${bindgenRoot(version)}`);
  run([
    "cargo",
    "install",
    "wasm-bindgen-cli",
    "--version",
    `=${version}`,
    "--locked",
    "--bin",
    "wasm-bindgen",
    "--root",
    bindgenRoot(version),
  ]);
  if (bindgenVersion(pinned) !== version)
    throw new Error(`wasm-bindgen ${version} introuvable après installation (${pinned})`);
  return pinned;
}

function pathRemap(): string {
  const flags = [`--remap-path-prefix=${homedir()}=~`, `--remap-path-prefix=${ROOT}=.`];
  return [process.env.RUSTFLAGS, ...flags].filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} Mio`
    : `${(bytes / 1024).toFixed(1)} Kio`;
}

async function build(toolchain: Toolchain, bindgen: string): Promise<Stamp> {
  const targetDir = join(ROOT, "target", "wasm");
  const inputs = await inputDigest(ROOT, toolchain);
  console.log(
    `▶ cargo build -p ${CRATE} --target ${TARGET} --release (${relative(ROOT, targetDir)})`,
  );
  run(
    [
      "cargo",
      "build",
      "-p",
      CRATE,
      "--lib",
      "--target",
      TARGET,
      "--release",
      "--locked",
      "--target-dir",
      targetDir,
    ],
    { ...PROFILE, RUSTFLAGS: pathRemap() },
  );
  const module = join(targetDir, TARGET, "release", `${OUT_NAME}.wasm`);
  const staging = join(targetDir, "bindgen");
  await rm(staging, { recursive: true, force: true });
  console.log(`▶ wasm-bindgen ${toolchain.wasmBindgen} --target web`);
  run([bindgen, module, "--out-dir", staging, ...BINDGEN_FLAGS]);
  await Bun.write(join(staging, ".gitignore"), "*\n");
  const stamp = await writeStamp(staging, toolchain, inputs);
  await mkdir(join(OUT_DIR, ".."), { recursive: true });
  await rm(OUT_DIR, { recursive: true, force: true });
  await rename(staging, OUT_DIR);
  return stamp;
}

async function report(stamp: Stamp): Promise<void> {
  const bytes = new Uint8Array(await Bun.file(join(OUT_DIR, WASM_FILE)).arrayBuffer());
  console.log(
    `✓ ${relative(ROOT, join(OUT_DIR, WASM_FILE))} : ${formatBytes(bytes.byteLength)} ` +
      `(gzip ${formatBytes(Bun.gzipSync(bytes, { level: 9 }).byteLength)}), ` +
      `wasm-bindgen ${stamp.wasmBindgen}`,
  );
}

export async function main(argv: string[]): Promise<number> {
  const unknown = argv.filter((arg) => arg !== "--force" && arg !== "--check");
  if (unknown.length || (argv.includes("--force") && argv.includes("--check"))) {
    console.error("usage: build-wasm.ts [--force | --check]");
    return 2;
  }
  const check = argv.includes("--check");
  const toolchain: Toolchain = {
    rustc: rustc(),
    wasmBindgen: lockedWasmBindgenVersion(await Bun.file(join(ROOT, "Cargo.lock")).text()),
  };
  const status = await stampStatus(ROOT, OUT_DIR, toolchain);
  if (check) {
    if (status.fresh) {
      console.log(`✓ WASM koharu-canvas à jour (${formatBytes(status.stamp.wasmBytes)})`);
      return 0;
    }
    console.error(`✗ WASM koharu-canvas ${status.reason} : ${status.detail}`);
    return 1;
  }
  if (status.fresh && !argv.includes("--force")) {
    console.log("✓ WASM koharu-canvas à jour : rien à reconstruire");
    await report(status.stamp);
    return 0;
  }
  if (!status.fresh) console.log(`▶ WASM koharu-canvas ${status.reason} : ${status.detail}`);
  ensureTarget(true);
  const bindgen = ensureWasmBindgen(toolchain.wasmBindgen);
  const started = performance.now();
  const stamp = await build(toolchain, bindgen);
  await report(stamp);
  console.log(`✓ construit en ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return 0;
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  });
  process.exit(code);
}
