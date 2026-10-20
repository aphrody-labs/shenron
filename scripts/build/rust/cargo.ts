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

type CargoAliases = Record<string, string | readonly string[]>;

const workspaceConfig = Bun.TOML.parse(
  await Bun.file(new URL("../../../.cargo/config.toml", import.meta.url)).text(),
) as { alias: CargoAliases };
const workspaceAliases = workspaceConfig.alias;

/** Resolve aliases before the wrapper classifies commands that need its build lease. */
export function expandCargoAliases(args: readonly string[], aliases: CargoAliases): string[] {
  const expanded = [...args];
  const commandIndex = expanded[0]?.startsWith("+") ? 1 : 0;
  const seen = new Set<string>();
  for (;;) {
    const name = expanded[commandIndex];
    if (name === undefined) return expanded;
    const alias = aliases[name];
    if (alias === undefined) return expanded;
    if (seen.has(name)) throw new Error(`Cyclic Cargo alias: ${name}`);
    seen.add(name);
    if (typeof alias === "string" && (alias.startsWith("!") || /["']/.test(alias))) {
      throw new Error(`Cargo alias requires explicit argument-array configuration: ${name}`);
    }
    const replacement = typeof alias === "string" ? alias.trim().split(/\s+/) : [...alias];
    if (!replacement[0]) throw new Error(`Empty Cargo alias: ${name}`);
    expanded.splice(commandIndex, 1, ...replacement);
  }
}

/** The command line running `cargo <args>`, serialized when APHRODY_CARGO_SERIAL is set. */
export function cargoCommand(
  args: readonly string[],
  env: Record<string, string | undefined> = process.env,
): string[] {
  const serial = env.APHRODY_CARGO_SERIAL?.trim();
  return serial ? [serial, ...expandCargoAliases(args, workspaceAliases)] : ["cargo", ...args];
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
