#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * `makensis` for the Tauri bundler on WSL: runs the Windows NSIS toolset
 * (%LOCALAPPDATA%\tauri\NSIS\makensis.exe, the one the bundler itself uses on Windows) on the
 * installer script, after translating its Linux paths into Windows paths (\\wsl.localhost\…
 * for the WSL filesystem, X:\… for /mnt/x). scripts/build/desktop.ts puts it on PATH.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const distro = process.env.WSL_DISTRO_NAME;
if (!distro) throw new Error("makensis-wsl runs inside WSL only");
const localAppData = process.env.SHENRON_WINDOWS_LOCALAPPDATA ?? "/mnt/c/Users/" + (process.env.SHENRON_WINDOWS_USER ?? process.env.USER) + "/AppData/Local";
const makensis = `${localAppData}/tauri/NSIS/makensis.exe`;
if (!existsSync(makensis)) throw new Error(`Windows NSIS toolset missing: ${makensis}`);

export function windowsPath(path: string): string {
  const drive = /^\/mnt\/([a-z])(\/.*)?$/.exec(path);
  if (drive) return `${drive[1]!.toUpperCase()}:${(drive[2] ?? "\\").replaceAll("/", "\\")}`;
  return `\\\\wsl.localhost\\${distro}${path.replaceAll("/", "\\")}`;
}

/** Quoted absolute Linux paths of an NSIS script become Windows paths. */
export function translateScript(text: string): string {
  return text.replace(/"(\/(?:home|tmp|root|usr|opt|var|mnt)\/[^"\n]*)"/g, (_match, path: string) => `"${windowsPath(path)}"`);
}

const args = process.argv.slice(2);
const translated = args.map((arg) => {
  if (arg.endsWith(".nsi") && existsSync(arg)) {
    const script = resolve(arg);
    const output = script.replace(/\.nsi$/, ".windows.nsi");
    writeFileSync(output, translateScript(readFileSync(script, "utf8")));
    return windowsPath(output);
  }
  return arg.startsWith("/") && existsSync(arg) ? windowsPath(arg) : arg;
});
const child = Bun.spawn([makensis, ...translated], { stdio: ["inherit", "inherit", "inherit"], cwd: process.cwd() });
process.exit(await child.exited);
