#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * `bun run test:rust`: tests every crate of the Cargo workspace, listed by `cargo metadata`
 * (no hand-written list), through cargo-nextest when it is installed (profiles in
 * .config/nextest.toml) and `cargo test` otherwise. Other arguments go to the runner.
 *
 *   bun run test:rust                          # nextest, default profile (or cargo test)
 *   bun run test:rust --profile ci             # the CI profile
 *   bun scripts/build/rust/test.ts --cargo-test -- --nocapture
 *   bun scripts/build/rust/test.ts --list      # print the crates and exit
 *
 * Cargo runs directly (scripts/build/rust/cargo.ts).
 */
import { cargoCommand, runCargo } from "./cargo.ts";

interface Metadata {
  packages: { name: string; manifest_path: string }[];
}

/** Workspace member names, sorted. */
export function workspaceCrates(metadata: Metadata): string[] {
  return metadata.packages.map((pkg) => pkg.name).sort();
}

/** Arguments of the test runner for `crates`, `extra` appended. */
export function testArgs(crates: readonly string[], nextest: boolean, extra: readonly string[]) {
  const packages = crates.flatMap((name) => ["-p", name]);
  return nextest ? ["nextest", "run", ...packages, ...extra] : ["test", ...packages, ...extra];
}

function hasNextest(): boolean {
  const probe = Bun.spawnSync(cargoCommand(["nextest", "--version"]), {
    stdout: "ignore",
    stderr: "ignore",
  });
  return probe.exitCode === 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const own = new Set(["--cargo-test", "--list"]);
  const metadata = Bun.spawnSync(["cargo", "metadata", "--no-deps", "--format-version", "1"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  if (metadata.exitCode !== 0) process.exit(metadata.exitCode ?? 1);
  const crates = workspaceCrates(JSON.parse(metadata.stdout.toString()) as Metadata);
  if (args.includes("--list")) {
    console.log(crates.join("\n"));
    process.exit(0);
  }
  const nextest = !args.includes("--cargo-test") && hasNextest();
  if (!nextest && !args.includes("--cargo-test")) {
    console.error("cargo-nextest absent (cargo install --locked cargo-nextest): cargo test");
  }
  const extra = args.filter((arg) => !own.has(arg));
  process.exit(await runCargo(testArgs(crates, nextest, extra)));
}
