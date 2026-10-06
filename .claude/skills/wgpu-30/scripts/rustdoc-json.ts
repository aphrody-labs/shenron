#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Produces the rustdoc JSON of one `wgpu` release (and `wgpu-types`, `naga`) that
 * `build-references.ts` and `api-diff.ts` read.
 *
 *   bun .claude/skills/wgpu-30/scripts/rustdoc-json.ts --version 30.0.1 --out /tmp/wgpu-doc/30 \
 *       [--toolchain nightly-2026-09-15]
 *
 * A throw-away crate pins the three crates at the exact version, then the nightly rustdoc writes
 * `<out>/{wgpu,wgpu_types,naga}.json`. Dependencies are only type-checked, so a run takes seconds
 * once the registry sources are cached. Needs a nightly toolchain (`rustup toolchain list`) and
 * network access to crates.io the first time.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const version = option("--version");
const out = option("--out");
if (!version || !out) throw new Error("usage: rustdoc-json.ts --version <x.y.z> --out <dir> [--toolchain <nightly-…>]");

const toolchain =
  option("--toolchain") ??
  (Bun.spawnSync(["rustup", "toolchain", "list"], { stdout: "pipe" })
    .stdout.toString()
    .split("\n")
    .map((line) => line.split(" ")[0]!)
    .filter((name) => name.startsWith("nightly-"))
    .toSorted()
    .at(-1)
    ?.replace(/-x86_64.*$/, ""));
if (!toolchain) throw new Error("no nightly toolchain installed (rustup toolchain install nightly)");

const work = mkdtempSync(join(tmpdir(), "wgpu-doc-"));
mkdirSync(join(work, "src"));
writeFileSync(join(work, "src", "lib.rs"), "");
writeFileSync(
  join(work, "Cargo.toml"),
  `[package]
name = "wgpu-doc-probe"
version = "0.0.0"
edition = "2024"
publish = false

[dependencies]
wgpu = "=${version}"
wgpu-types = "=${version}"
naga = { version = "=${version}", features = ["wgsl-in", "wgsl-out", "spv-in", "spv-out", "glsl-in", "glsl-out", "msl-out", "hlsl-out"] }
`,
);

const target = join(work, "target");
for (const pkg of ["wgpu-types", "wgpu", "naga"]) {
  const run = Bun.spawnSync(
    ["cargo", `+${toolchain}`, "rustdoc", "-p", pkg, "--lib", "--", "-Z", "unstable-options", "--output-format", "json"],
    { cwd: work, env: { ...process.env, CARGO_TARGET_DIR: target, RUSTC_WRAPPER: "" }, stdout: "inherit", stderr: "inherit" },
  );
  if (run.exitCode !== 0) throw new Error(`cargo rustdoc -p ${pkg} failed`);
}

const dest = resolve(out);
mkdirSync(dest, { recursive: true });
const docDir = join(target, "doc");
for (const file of readdirSync(docDir)) {
  if (/^(wgpu|wgpu_types|naga)\.json$/.test(file)) copyFileSync(join(docDir, file), join(dest, file));
}
if (!existsSync(join(dest, "wgpu.json"))) throw new Error("wgpu.json was not produced");
console.log(`rustdoc JSON of wgpu ${version} in ${dest} (toolchain ${toolchain})`);
