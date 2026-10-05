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
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const BOT = join(ROOT, "apps/bot");
const args = process.argv.slice(2);
const index = args.indexOf("--target");
const target = (index >= 0 ? args[index + 1] : process.platform === "win32" ? "windows-x64" : "linux-x64") as
  | "linux-x64"
  | "windows-x64";
const bunTarget = { "linux-x64": "bun-linux-x64", "windows-x64": "bun-windows-x64" }[target];
if (!bunTarget) throw new Error("--target linux-x64|windows-x64");
const out = join(ROOT, "dist/bot", target);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const exe = join(out, target === "windows-x64" ? "shenron-bot.exe" : "shenron-bot");
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
    "--compile",
    `--target=${bunTarget}`,
    "--minify-whitespace",
    "--minify-syntax",
    "--outfile",
    exe,
  ],
  { cwd: BOT, stdio: ["inherit", "inherit", "inherit"] },
);
if ((await child.exited) !== 0) throw new Error("bot compile failed");
// Migrations are read from disk by drizzle at boot: ship them beside the binary.
const migrations = join(BOT, "src/db/migrations");
if (existsSync(migrations)) cpSync(migrations, join(out, "src/db/migrations"), { recursive: true });
console.log(JSON.stringify({ target, binary: exe, sizeMiB: Math.round(statSync(exe).size / 1048576) }));
