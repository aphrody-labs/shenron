#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Runs plain `cargo` for the Shenron workspace (aliases of .cargo/config.toml resolved by
 * Cargo itself). The `*:rust` scripts of package.json and the justfile go through it.
 *
 *   bun scripts/build/rust/cargo.ts <cargo arguments…>
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** The command line running `cargo <args>`. */
export function cargoCommand(args: readonly string[]): string[] {
  return ["cargo", ...args];
}

/** Auto-discovers MSVC and Windows Kits C/C++ include directories for bindgen/clang on Windows. */
export function windowsBindgenEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform !== "win32" || base.BINDGEN_EXTRA_CLANG_ARGS) return base;
  const includes: string[] = [];
  for (const root of [
    "C:/Program Files/Microsoft Visual Studio",
    "C:/Program Files (x86)/Microsoft Visual Studio",
  ]) {
    if (!existsSync(root)) continue;
    const found = [
      ...new Bun.Glob("**/VC/Tools/MSVC/*/include/vcruntime.h").scanSync({
        cwd: root,
        absolute: true,
      }),
    ].toSorted();
    if (found.length) {
      includes.push(dirname(found.at(-1)!));
      break;
    }
  }
  const kitsRoot = "C:/Program Files (x86)/Windows Kits/10/Include";
  if (existsSync(kitsRoot)) {
    const ucrt = [
      ...new Bun.Glob("*/ucrt/stdio.h").scanSync({ cwd: kitsRoot, absolute: true }),
    ].toSorted();
    if (ucrt.length) {
      const sdkVerDir = dirname(dirname(ucrt.at(-1)!));
      for (const sub of ["ucrt", "um", "shared"]) {
        const dir = join(sdkVerDir, sub);
        if (existsSync(dir)) includes.push(dir);
      }
    }
  }
  if (!includes.length) return base;
  const clangArgs = includes.map((dir) => `"-I${dir.replaceAll("\\", "/")}"`).join(" ");
  const ninjaExe = Bun.which("ninja.exe");
  const pathKey = Object.keys(base).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const currentPath = base[pathKey] ?? "";
  return {
    ...base,
    ...(ninjaExe
      ? {
          [pathKey]: `${dirname(ninjaExe)};${currentPath}`,
          CMAKE_MAKE_PROGRAM: ninjaExe.replaceAll("\\", "/"),
        }
      : {}),
    INCLUDE: base.INCLUDE ? `${base.INCLUDE};${includes.join(";")}` : includes.join(";"),
    BINDGEN_EXTRA_CLANG_ARGS: clangArgs,
  };
}

/** Runs `cargo <args>` with inherited stdio and returns its exit code. */
export async function runCargo(args: readonly string[]): Promise<number> {
  const child = Bun.spawn(cargoCommand(args), {
    stdio: ["inherit", "inherit", "inherit"],
    env: windowsBindgenEnv(process.env),
  });
  return await child.exited;
}

if (import.meta.main) process.exit(await runCargo(process.argv.slice(2)));
