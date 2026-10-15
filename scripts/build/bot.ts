#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build the autonomous `shenron-bot` binary (Discord bot + public API) with bun build --compile.
 *
 *   bun scripts/build/bot.ts [--target linux-x64|windows-x64]
 *
 * The binary carries every command and event (static barrel src/_entries.ts) and its SQL
 * migrations; `shenron-bot --smoke` loads them all without databases or Discord.
 */
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  copyRuntimeDirectory,
  copyRuntimeFile,
  buildSourcePipelineAsset,
} from "./bot-runtime-assets";

const ROOT = resolve(import.meta.dir, "../..");
const BOT = join(ROOT, "apps/bot");
const args = process.argv.slice(2);
const index = args.indexOf("--target");
const target = (
  index >= 0 ? args[index + 1] : process.platform === "win32" ? "windows-x64" : "linux-x64"
) as "linux-x64" | "windows-x64";
const bunTarget = { "linux-x64": "bun-linux-x64", "windows-x64": "bun-windows-x64" }[target];
if (!bunTarget) throw new Error("--target linux-x64|windows-x64");
const out = join(ROOT, "dist/bot", target);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const exe = join(out, target === "windows-x64" ? "shenron-bot.exe" : "shenron-bot");
// The canvas loader uses dynamic require(), so Bun cannot discover its native addon.
// Resolve from the package itself to respect the isolated dependency linker.
const canvas = Bun.resolveSync("@napi-rs/canvas", BOT);
const canvasPlatform = target === "windows-x64" ? "win32-x64-msvc" : "linux-x64-gnu";
const canvasBinding = Bun.resolveSync(`@napi-rs/canvas-${canvasPlatform}`, dirname(canvas));
const child = Bun.spawn(
  [
    process.execPath,
    join(ROOT, "scripts/build/measure.ts"),
    "--out",
    join(ROOT, "dist/bot/measures.jsonl"),
    "--label",
    `bot-compile-${target}`,
    "--",
    process.execPath,
    "build",
    "src/entry-standalone.ts",
    // Workers are extra entry points: new Worker() can only load modules embedded in the binary.
    "src/workers/indexer.ts",
    "src/workers/vector-builder.ts",
    canvas,
    canvasBinding,
    "--compile",
    "--asset-naming=[name].[ext]",
    `--target=${bunTarget}`,
    `--external=@napi-rs/canvas-${canvasPlatform}`,
    // Cross-compiling: the fork's runtime for the target (upstream has no build of the fork's version).
    ...(process.env.SHENRON_COMPILE_BUN
      ? [`--compile-executable-path=${process.env.SHENRON_COMPILE_BUN}`]
      : []),
    "--minify-whitespace",
    "--minify-syntax",
    "--outfile",
    exe,
  ],
  { cwd: BOT, stdio: ["inherit", "inherit", "inherit"] },
);
if ((await child.exited) !== 0) throw new Error("bot compile failed");
// Bun's compiled loader keeps the napi binding as a relative native require.
// Keep the platform package beside the binary so the sealed image can copy it
// into the runtime filesystem; this is required by Bun 1.4.4 as well as Linux.
copyRuntimeFile(canvasBinding, join(out, `skia.${canvasPlatform}.node`));
// Migrations are read from disk by drizzle at boot: ship them beside the binary.
const migrations = join(BOT, "src/db/migrations");
if (existsSync(migrations)) copyRuntimeDirectory(migrations, join(out, "src/db/migrations"));
const revision = Bun.spawn(["git", "rev-parse", "HEAD"], {
  cwd: ROOT,
  stdout: "pipe",
  stderr: "ignore",
});
const sourceCommit = (await new Response(revision.stdout).text()).trim();
if ((await revision.exited) !== 0) throw Error("Cannot pin bot source revision");
const pipeline = await buildSourcePipelineAsset(
  join(ROOT, "scripts/ops/bun-source-pipeline.ts"),
  out,
  sourceCommit,
);
console.log(
  JSON.stringify({
    target,
    binary: exe,
    sizeMiB: Math.round(statSync(exe).size / 1048576),
    pipeline,
  }),
);
