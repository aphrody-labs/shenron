#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Cargo runner for `cargo tauri build --runner` and scripts/build/desktop.ts: forwards
 * `build …` to cargo, through cargo-xwin for an MSVC target built on Linux.
 */
import { msvcCrossConfig } from "./msvc-cross.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const target = option("--target") ?? "";
const crossMsvc = process.platform !== "win32" && target.endsWith("-pc-windows-msvc");

if (import.meta.main) {
  const command = crossMsvc ? ["cargo-xwin", ...args] : ["cargo", ...args];
  if (crossMsvc) command.push(...msvcCrossConfig(process.env.CFLAGS));
  const child = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"], env: process.env });
  process.exit(await child.exited);
}
