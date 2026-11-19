#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Builds the Bevy game of crates/dragon-pixel for the browser and stages it like the Gecko build:
 * cargo (wasm32-unknown-unknown, `bevy` feature, production profile sized for download), wasm-bindgen
 * (`--target web`), wasm-opt, then content-hashed names, the glue rewritten to the hashed wasm and a
 * generated manifest the site imports. Rust builds run on fr1 or CI, never on the workstation:
 *
 *   timeout 3600 ssh fr1 'cd <checkout> && bun scripts/ops/build-dragon-pixel-wasm.ts [--skip-cargo]'
 *
 * Options: --out <dir> (default apps/site/public/wasm/dragon-pixel), --manifest <file>,
 * --source-rev <sha>, --skip-cargo (reuse the existing cargo output and only run bindgen and opt).
 */
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

if (process.platform === "win32")
  throw new Error("Rust builds run on fr1 or CI, never on the workstation");

const run = async (command: string[], env: Record<string, string> = {}): Promise<void> => {
  console.log(`$ ${command.join(" ")}`);
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${command[0]} exited with ${code}`);
};

const targetDir = process.env.CARGO_TARGET_DIR ?? join(root, "target");
const cargoOutput = join(targetDir, "wasm32-unknown-unknown/production/dragon_pixel.wasm");

if (!Bun.argv.includes("--skip-cargo")) {
  // Size over speed for a download: opt-level s, abort on panic (wasm has no unwinding).
  await run(
    [
      "nice",
      "-n",
      "19",
      "ionice",
      "-c3",
      "cargo",
      "build",
      "-p",
      "dragon-pixel",
      "--lib",
      "--features",
      "bevy",
      "--target",
      "wasm32-unknown-unknown",
      "--profile",
      "production",
      "-j2",
    ],
    {
      CARGO_PROFILE_PRODUCTION_OPT_LEVEL: "s",
      CARGO_PROFILE_PRODUCTION_PANIC: "abort",
      // Keep the symbol table: wasm-bindgen reads the target features section that `symbols` strips.
      CARGO_PROFILE_PRODUCTION_STRIP: "debuginfo",
    },
  );
}

const work = await mkdtemp(join(tmpdir(), "dragon-pixel-wasm-"));
try {
  await run([
    "wasm-bindgen",
    "--target",
    "web",
    "--no-typescript",
    "--out-dir",
    work,
    "--out-name",
    OUT_NAME,
    cargoOutput,
  ]);
  const rawFile = join(work, `${OUT_NAME}_bg.wasm`);
  const optimizedFile = join(work, `${OUT_NAME}_bg.opt.wasm`);
  await run(["wasm-opt", "-Oz", "--all-features", "-o", optimizedFile, rawFile]);

  const raw = new Uint8Array(await Bun.file(rawFile).arrayBuffer());
  const wasm = new Uint8Array(await Bun.file(optimizedFile).arrayBuffer());
  if (wasm.length < 1_000_000 || wasm[0] !== 0x00 || wasm[1] !== 0x61 || wasm[2] !== 0x73)
    throw new Error("the optimized module is missing or not a WebAssembly module");

  const wasmSha = sha256(wasm);
  const wasmName = hashedName(`${OUT_NAME}_bg`, "wasm", wasmSha);
  const glue = await Bun.file(join(work, `${OUT_NAME}.js`)).text();
  if (!glue.includes(`${OUT_NAME}_bg.wasm`))
    throw new Error(`the glue does not reference ${OUT_NAME}_bg.wasm`);
  const patched = new TextEncoder().encode(glue.replaceAll(`${OUT_NAME}_bg.wasm`, wasmName));
  const jsName = hashedName(OUT_NAME, "js", sha256(patched));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await Bun.write(join(outDir, wasmName), wasm);
  await Bun.write(join(outDir, jsName), patched);

  const gitRevision = await Bun.$`git -C ${root} rev-parse --short HEAD`.nothrow().quiet().text();
  const sourceRevision = option("--source-rev") ?? (gitRevision.trim() || "unknown");
  const manifest: DragonPixelManifest = {
    js: `dragon-pixel/${jsName}`,
    wasm: `dragon-pixel/${wasmName}`,
    wasmSha256: wasmSha,
    wasmBytes: wasm.length,
    rawBytes: raw.length,
    sourceRevision,
  };
  await Bun.write(manifestFile, manifestSource(manifest));
  console.log(JSON.stringify({ ...manifest, staged: await readdir(outDir) }));
} finally {
  await rm(work, { recursive: true, force: true });
}
