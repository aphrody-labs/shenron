#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Runs cargo for the Shenron workspace: through the serialized build wrapper named by
 * APHRODY_CARGO_SERIAL when it is set (Aphrody machines: shared build lock, bounded jobs,
 * sccache; see docs/development/rust.md), plain `cargo` otherwise. The `*:rust` scripts of
 * package.json and the justfile go through it.
 *
 *   bun scripts/build/rust/cargo.ts <cargo arguments…>
 */

/** The command line running `cargo <args>`, serialized when APHRODY_CARGO_SERIAL is set. */
export function cargoCommand(
  args: readonly string[],
  env: Record<string, string | undefined> = process.env,
): string[] {
  const serial = env.APHRODY_CARGO_SERIAL?.trim();
  return serial ? [serial, ...args] : ["cargo", ...args];
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
