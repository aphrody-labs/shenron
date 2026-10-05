#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Byte-level duplicate audit of every asset tree of the repository (sha256 by content).
 *
 *   bun scripts/audit/assets-dedup.ts [--json] [root...]
 *
 * Default roots: the site's public/, the bot's assets/ and public/, the UI package assets and
 * the desktop icons. Reports groups of identical files, the duplicate count and the bytes a
 * single copy per content would recover. Tracked files only (git ls-files).
 */
import { $ } from "bun";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const args = process.argv.slice(2);
const json = args.includes("--json");
const roots = args.filter((arg) => !arg.startsWith("--"));
const scan = roots.length
  ? roots
  : ["apps/site/public", "apps/bot/assets", "apps/bot/public", "packages/ui/assets", "packages/images", "crates/shenron-desktop/icons", "crates/shenron-desktop/splash"];

const files = (await $`git -C ${ROOT} ls-files -- ${scan}`.text()).split("\n").filter(Boolean);
const groups = new Map<string, { size: number; paths: string[] }>();
let totalBytes = 0;
for (const path of files) {
  const file = Bun.file(join(ROOT, path));
  if (!(await file.exists())) continue;
  const bytes = await file.bytes();
  totalBytes += bytes.byteLength;
  const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const group = groups.get(hash) ?? { size: bytes.byteLength, paths: [] };
  group.paths.push(path);
  groups.set(hash, group);
}
const duplicates = [...groups.entries()].filter(([, g]) => g.paths.length > 1).sort((a, b) => b[1].size * (b[1].paths.length - 1) - a[1].size * (a[1].paths.length - 1));
const duplicateFiles = duplicates.reduce((n, [, g]) => n + g.paths.length - 1, 0);
const recoverable = duplicates.reduce((n, [, g]) => n + g.size * (g.paths.length - 1), 0);
const report = {
  roots: scan,
  files: files.length,
  uniqueContents: groups.size,
  totalBytes,
  duplicateGroups: duplicates.length,
  duplicateFiles,
  recoverableBytes: recoverable,
  groups: duplicates.map(([hash, g]) => ({ sha256: hash, size: g.size, paths: g.paths })),
};
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `${report.files} fichiers, ${report.uniqueContents} contenus uniques, ${(totalBytes / 1048576).toFixed(1)} Mio ; ` +
      `${duplicates.length} groupes de doublons, ${duplicateFiles} copies en trop, ${(recoverable / 1048576).toFixed(2)} Mio récupérables`,
  );
  for (const g of report.groups.slice(0, 20)) console.log(`  ${g.size} o × ${g.paths.length} : ${g.paths.join("  ")}`);
}
process.exitCode = 0;
