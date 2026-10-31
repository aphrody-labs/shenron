#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Runs plain `cargo` for the Shenron workspace (aliases of .cargo/config.toml resolved by
 * Cargo itself). The `*:rust` scripts of package.json and the justfile go through it.
 *
 *   bun scripts/build/rust/cargo.ts <cargo arguments…>
 */

/** The command line running `cargo <args>`. */
export function cargoCommand(args: readonly string[]): string[] {
  return ["cargo", ...args];
}

/** Runs `cargo <args>` with inherited stdio and returns its exit code. */
export async function runCargo(args: readonly string[]): Promise<number> {
  const child = Bun.spawn(cargoCommand(args), {
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });
  return await child.exited;
}

if (import.meta.main) process.exit(await runCargo(process.argv.slice(2)));
