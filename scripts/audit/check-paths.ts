#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Fails on hardcoded absolute paths (Windows drives, /home, /root, /srv, /Users) in tracked files;
 * exemptions live in paths.allow or on lines carrying `paths:ok`.
 *
 * The scanner is tools/paths.ts of the ay repository: `PATHS_SCANNER`, else the sibling checkout
 * `$WORKSPACE_ROOT/ay` (WORKSPACE_ROOT defaults to the parent of this repository). CI downloads it.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../..");
const workspace = process.env.WORKSPACE_ROOT ?? resolve(repo, "..");
const scanner = process.env.PATHS_SCANNER ?? join(workspace, "ay", "tools", "paths.ts");
if (!existsSync(scanner)) {
  console.error(`path scanner not found: ${scanner} (set PATHS_SCANNER or WORKSPACE_ROOT)`);
  process.exit(2);
}
const run = Bun.spawnSync([process.execPath, scanner, "--root", repo, ...process.argv.slice(2)], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(run.exitCode);
