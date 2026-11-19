// SPDX-License-Identifier: Apache-2.0
/**
 * Writes MAP.tsv: one line per area of the repository with the tracked file count, the tracked bytes,
 * the tier and the gate command, so an agent learns the layout in one small read.
 *
 *   bun scripts/repo-map.ts           write MAP.tsv
 *   bun scripts/repo-map.ts --check   exit 1 when MAP.tsv is stale (used by `just map-check`)
 *
 * Input is `git ls-tree -r -l HEAD` (blob sizes of the commit), so the output depends on the commit only, not
 * on uncommitted edits, line endings of the checkout, build outputs or caches. MAP.tsv itself is not counted.
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const MAP = join(root, "MAP.tsv");

/** Directories listed one level deeper: their children are the units agents work on. */
const SPLIT = new Set(["apps", "crates", "packages"]);

type Tier = "first-party" | "vendored" | "content" | "docs" | "ops" | "config";

function tier(area: string): Tier {
  const top = area.split("/")[0]!;
  if (top === "third_party") return "vendored";
  if (top === "data" || top === "themes" || top === "templates") return "content";
  if (top === "docs" || top === "research_notes" || top === "reports" || top === "replica") return "docs";
  if (top === "deploy" || top === "scripts" || top === ".github" || top === "migration") return "ops";
  if (!area.includes("/") && !SPLIT.has(top) && /\.[a-z]+$/i.test(top)) return "config";
  if (top.startsWith(".")) return "config";
  return "first-party";
}

function gate(area: string): string {
  const [top, name] = area.split("/");
  if (top === "crates" && name) return `cargo clippy -p ${name} --all-targets -- -D warnings (fr1)`;
  if ((top === "apps" || top === "packages") && name) return `bun test ${area}`;
  if (top === "scripts") return "bun test scripts";
  if (top === "third_party") return "-";
  if (top === "docs") return "link check";
  return "just check";
}

const listing = Bun.spawnSync(["git", "ls-tree", "-r", "-l", "-z", "HEAD"], { cwd: root });
if (listing.exitCode !== 0) throw new Error("git ls-tree failed");
// Each record: "<mode> <type> <object> <size>\t<path>"; submodules (type commit) have size "-".
const blobs = new TextDecoder()
  .decode(listing.stdout)
  .split("\0")
  .filter(Boolean)
  .map((record) => {
    const [meta, path] = record.split("\t") as [string, string];
    const size = meta.trim().split(/\s+/)[3];
    return { path, bytes: size === "-" ? 0 : Number(size) };
  })
  .filter(({ path }) => path !== "MAP.tsv");

const areas = new Map<string, { files: number; bytes: number }>();
for (const { path: file, bytes } of blobs) {
  const parts = file.split("/");
  const area = parts.length > 2 && SPLIT.has(parts[0]!) ? `${parts[0]}/${parts[1]}` : parts.length > 1 ? parts[0]! : "(root)";
  const entry = areas.get(area) ?? { files: 0, bytes: 0 };
  entry.files += 1;
  entry.bytes += bytes;
  areas.set(area, entry);
}

const lines = ["area\tfiles\tbytes\ttier\tgate"];
for (const [area, { files: count, bytes }] of [...areas].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push([area, count, bytes, area === "(root)" ? "config" : tier(area), area === "(root)" ? "just check" : gate(area)].join("\t"));
}
const output = `${lines.join("\n")}\n`;

if (process.argv.includes("--check")) {
  const current = await Bun.file(MAP).text().catch(() => "");
  if (current !== output) {
    console.error("MAP.tsv is stale: run `just map`");
    process.exit(1);
  }
  console.log(`MAP.tsv up to date (${lines.length - 1} areas)`);
} else {
  await Bun.write(MAP, output);
  console.log(`MAP.tsv: ${lines.length - 1} areas, ${output.length} bytes`);
}
