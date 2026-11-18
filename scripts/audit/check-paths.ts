#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Fails on hardcoded absolute paths (Windows drives, /home, /root, /srv, /Users) in tracked files;
 * exemptions live in paths.allow or on lines carrying `paths:ok`.
 *
 * The scanner is the single-file tools/paths.ts of aphrody-labs/ay, taken in this order:
 * 1. `SHENRON_PATHS_SCANNER` (alias `PATHS_SCANNER`): a local file, for example a developer checkout;
 * 2. the copy of the pinned commit below, fetched once into the gitignored `.cache/` of this repository;
 * 3. when neither is available (offline), the check is skipped with a notice: a clean clone never depends on another repository.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SCANNER_REPO = "aphrody-labs/ay";
const SCANNER_SHA = "02e2737216665ff8ee1a8f470df8f16c604d2de0";

const repo = resolve(import.meta.dir, "../..");

async function resolveScanner(): Promise<string | undefined> {
  const override = process.env.SHENRON_PATHS_SCANNER ?? process.env.PATHS_SCANNER;
  if (override) return existsSync(override) ? override : undefined;
  const cached = join(repo, ".cache", "paths-scanner", SCANNER_SHA, "paths.ts");
  if (existsSync(cached)) return cached;
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${SCANNER_REPO}/${SCANNER_SHA}/tools/paths.ts`,
      {
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) return undefined;
    mkdirSync(join(cached, ".."), { recursive: true });
    writeFileSync(cached, await res.text());
    return cached;
  } catch {
    return undefined;
  }
}

const scanner = await resolveScanner();
if (!scanner) {
  console.warn(
    "check:paths skipped: the pinned path scanner is unavailable (set SHENRON_PATHS_SCANNER to a local paths.ts)",
  );
  process.exit(0);
}
const run = Bun.spawnSync([process.execPath, scanner, "--root", repo, ...process.argv.slice(2)], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(run.exitCode);
