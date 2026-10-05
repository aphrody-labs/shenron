#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Cargo runner for `cargo tauri build --runner`: forwards `build …` to cargo, through
 * cargo-xwin for an MSVC target built on Linux, and through the serialized build wrapper
 * named by APHRODY_CARGO_SERIAL when set (shared build lock, bounded jobs, sccache).
 */
const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const target = targetIndex >= 0 ? (args[targetIndex + 1] ?? "") : "";
const crossMsvc = process.platform !== "win32" && target.endsWith("-pc-windows-msvc");
const serial = process.env.APHRODY_CARGO_SERIAL?.trim();
const command = serial
  ? [serial, ...(crossMsvc ? ["xwin"] : []), ...args]
  : crossMsvc
    ? ["cargo-xwin", ...args]
    : ["cargo", ...args];
const child = Bun.spawn(command, { stdio: ["inherit", "inherit", "inherit"], env: process.env });
process.exit(await child.exited);
