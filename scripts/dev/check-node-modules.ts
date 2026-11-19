#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Refuses a `node_modules` whose isolated store links into the Bun global cache.
 *
 * Turbopack resolves every module through its real path. With the global virtual store
 * (`BUN_INSTALL_GLOBAL_STORE=1` in the environment, or `globalStore = true` in `~/.bunfig.toml`;
 * the environment wins over the project `bunfig.toml`), `node_modules/.bun/<pkg>` is a junction into
 * `~/.bun/install/cache/links/`, outside the workspace: sibling dependencies are then unreachable
 * and `next build` reports hundreds of "Can't resolve" errors (react, zod, lucide-react, ...).
 * Fix: `BUN_INSTALL_GLOBAL_STORE=0 bun install --frozen-lockfile --force` (or `just install`).
 */
import { lstatSync, readdirSync, readlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const store = resolve(import.meta.dir, "../../node_modules/.bun");
let names: string[];
try {
  names = readdirSync(store);
} catch {
  console.error("node_modules/.bun is missing: run `just install`.");
  process.exit(1);
}
const linked = names.filter((n) => {
  if (n === "node_modules") return false;
  try {
    return lstatSync(join(store, n)).isSymbolicLink();
  } catch {
    return false;
  }
});
if (linked.length > 0) {
  const sample = linked[0]!;
  let target = "";
  try {
    target = readlinkSync(join(store, sample));
  } catch {}
  console.error(
    `node_modules/.bun: ${linked.length} entries link outside the workspace (${sample} -> ${target}).\n` +
      "The Bun global virtual store breaks Turbopack resolution. Reinstall with:\n" +
      "  BUN_INSTALL_GLOBAL_STORE=0 bun install --frozen-lockfile --force",
  );
  process.exit(1);
}
