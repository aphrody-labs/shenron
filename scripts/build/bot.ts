#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build the autonomous `shenron-bot` binary (Discord bot + public API) with bun build --compile.
 *
 *   bun scripts/build/bot.ts [--target linux-x64|linux-x64-musl|windows-x64] [--no-aot]
 *                            [--aot-log-type-mismatches]
 *
 * Native targets compile ahead of time (`--aot`, see ./compile-mode.ts); a cross target,
 * `--no-aot` or `SHENRON_AOT=0` keeps a bytecode bundle, and a failed AOT compile falls back to it.
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
import {
  aotBun,
  aotRequested,
  chooseCompileMode,
  compileModeFlags,
  supportsAot,
  type CompileMode,
} from "./compile-mode";

const ROOT = resolve(import.meta.dir, "../..");
const BOT = join(ROOT, "apps/bot");
const args = process.argv.slice(2);
const index = args.indexOf("--target");
const target = (
  index >= 0 ? args[index + 1] : process.platform === "win32" ? "windows-x64" : "linux-x64"
) as "linux-x64" | "linux-x64-musl" | "windows-x64";
const bunTarget = {
  "linux-x64": "bun-linux-x64",
  "linux-x64-musl": "bun-linux-x64-musl",
  "windows-x64": "bun-windows-x64",
}[target];
if (!bunTarget) throw new Error("--target linux-x64|linux-x64-musl|windows-x64");
const out = join(ROOT, "dist/bot", target);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const exe = join(out, target === "windows-x64" ? "shenron-bot.exe" : "shenron-bot");
// The canvas loader uses dynamic require(), so Bun cannot discover its native addon.
// Resolve from the package itself to respect the isolated dependency linker.
const canvas = Bun.resolveSync("@napi-rs/canvas", BOT);
const canvasPlatform = {
  "linux-x64": "linux-x64-gnu",
  "linux-x64-musl": "linux-x64-musl",
  "windows-x64": "win32-x64-msvc",
}[target];
const canvasBinding = Bun.resolveSync(`@napi-rs/canvas-${canvasPlatform}`, dirname(canvas));
async function compile(mode: CompileMode): Promise<number> {
  const child = Bun.spawn(
    [
      process.execPath,
      join(ROOT, "scripts/build/measure.ts"),
      "--out",
      join(ROOT, "dist/bot/measures.jsonl"),
      "--label",
      `bot-compile-${target}-${mode}`,
      "--",
      aotBun(mode),
      "build",
      "src/entry-standalone.ts",
      // Workers are extra entry points: new Worker() can only load modules embedded in the binary.
      // The embedded root is pinned to apps/bot (cwd): without `--root` Bun derives it from the
      // entries, and the canvas addon below lives outside apps/bot, so the workers' embedded path
      // moved with the checkout layout. They are at `src/workers/` (see src/lib/bundled-worker.ts).
      "--root",
      ".",
      "src/workers/indexer.ts",
      "src/workers/vector-builder.ts",
      "src/workers/render.ts",
      canvas,
      canvasBinding,
      "--compile",
      // discordx, tsyringe and the workers run compiled; the canvas addon is a native require()
      // of NAPI_RS_NATIVE_LIBRARY_PATH beside the binary (src/lib/canvas-binding.ts): AOT must
      // allow that load from disk.
      ...compileModeFlags(mode, { codeFromDisk: true }),
      // Opt-in: removes the Bun APIs the code never calls (-45 MiB on Linux). --smoke does not exercise
      // the gateway or the database, so it is not the default until a deploy has run it.
      ...(mode === "aot" && process.env.SHENRON_AOT_TRIM === "1" ? ["--trim"] : []),
      ...(mode === "aot" && args.includes("--aot-log-type-mismatches")
        ? ["--aot-log-type-mismatches"]
        : []),
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
  return child.exited;
}

const choice = chooseCompileMode({
  target,
  aot: aotRequested(args),
  compileBun: process.env.SHENRON_COMPILE_BUN,
});
let mode = choice.mode;
if (mode === "aot" && !supportsAot(aotBun(mode))) {
  mode = "bytecode";
  choice.reason = `${aotBun("aot")} has no --aot`;
}
if (choice.reason)
  console.error(JSON.stringify({ label: "bot-compile-mode", mode, reason: choice.reason }));
if ((await compile(mode)) !== 0) {
  if (mode !== "aot") throw new Error("bot compile failed");
  // A dependency the AOT compiler rejects must not block a release: keep the bytecode build.
  console.error(
    JSON.stringify({ label: "bot-compile-mode", mode: "bytecode", reason: "aot failed" }),
  );
  mode = "bytecode";
  if ((await compile(mode)) !== 0) throw new Error("bot compile failed");
}
// Bun's compiled loader keeps the napi binding as a relative native require.
// Keep the platform package beside the binary so the sealed image can copy it
// into the runtime filesystem; this is required by Bun 1.4.4 as well as Linux.
copyRuntimeFile(canvasBinding, join(out, `skia.${canvasPlatform}.node`));
// Skia shapes the letter-spaced lettering of the cards with ICU data read next to the binary:
// without `icudtl.dat` the first card drawn aborts the process (render workers included).
const icuData = join(dirname(canvasBinding), "icudtl.dat");
if (existsSync(icuData)) copyRuntimeFile(icuData, join(out, "icudtl.dat"));
// Migrations are read from disk by drizzle at boot: ship them beside the binary.
const migrations = join(BOT, "src/db/migrations");
if (existsSync(migrations)) copyRuntimeDirectory(migrations, join(out, "src/db/migrations"));
// Canvas fonts and banners: the image has no source tree and Infra mounts /app/assets.
const canvasAssets = Bun.spawn(
  [process.execPath, "scripts/ship-canvas-assets.ts", join(out, "share")],
  { cwd: BOT, stdio: ["inherit", "inherit", "inherit"] },
);
if ((await canvasAssets.exited) !== 0) throw new Error("canvas assets copy failed");
// A release worktree's `.git` points outside the build container: the caller passes the commit.
const sourceCommit = process.env.SHENRON_REVISION ?? (await gitHead());
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw Error("Cannot pin bot source revision");

async function gitHead(): Promise<string> {
  const revision = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "ignore",
  });
  const head = (await new Response(revision.stdout).text()).trim();
  if ((await revision.exited) !== 0) throw Error("Cannot pin bot source revision");
  return head;
}
const pipeline = await buildSourcePipelineAsset(
  join(ROOT, "scripts/ops/bun-source-pipeline.ts"),
  out,
  sourceCommit,
);
console.log(
  JSON.stringify({
    target,
    binary: exe,
    mode,
    sizeMiB: Math.round(statSync(exe).size / 1048576),
    pipeline,
  }),
);
