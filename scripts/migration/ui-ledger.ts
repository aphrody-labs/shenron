// SPDX-License-Identifier: Apache-2.0
/**
 * UI migration ledger: every shadcn-style wrapper of packages/ui (Base UI + Tailwind) with its GPUI
 * target and measured state, written to migration/ui.json.
 *
 *   bun scripts/migration/ui-ledger.ts           write migration/ui.json and print a summary
 *   bun scripts/migration/ui-ledger.ts --check   exit 1 when migration/ui.json is stale or a wrapper has no row
 *
 * Sources, all read from the working tree:
 *   - packages/ui/src/components/*.tsx   the wrappers; the Base UI primitive is read from the import
 *     `@base-ui/react/<primitive>`, Tailwind weight from the number of class strings
 *   - docs/plans/base-ui-gpui-parity-matrix.md   summary table: GPUI module, parity status, effort
 *   - scripts/parity/states.json   gallery state ids, to know which wrappers have a parity gallery
 *   - apps/*, packages/*   import count of each wrapper, to order the migration by use
 * The parity state is `unmeasured` until scripts/parity/out holds a diff report for the wrapper.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const LEDGER = join(root, "migration", "ui.json");
const COMPONENTS = join(root, "packages", "ui", "src", "components");

interface MatrixRow {
  gpui: string;
  status: "full" | "partial" | "missing" | "unknown";
  effort: string;
}

function parseMatrix(): Map<string, MatrixRow> {
  const rows = new Map<string, MatrixRow>();
  const text = readFileSync(join(root, "docs", "plans", "base-ui-gpui-parity-matrix.md"), "utf8");
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    // | component | Base UI parts | GPUI module(s) | status | effort |
    if (cells.length < 7 || !/^[a-z][a-z-]*$/.test(cells[1] ?? "")) continue;
    const status = (cells[4] ?? "").split(/[ (,]/)[0] ?? "";
    if (status !== "full" && status !== "partial" && status !== "missing") continue;
    rows.set(cells[1]!, { gpui: cells[3]!.replace(/`/g, ""), status, effort: (cells[5] ?? "").split(" ")[0] ?? "" });
  }
  return rows;
}

function gallerySurfaces(): Set<string> {
  const path = join(root, "scripts", "parity", "states.json");
  if (!existsSync(path)) return new Set();
  const text = readFileSync(path, "utf8");
  return new Set([...text.matchAll(/"id":\s*"([a-z-]+)\//g)].map((match) => match[1]!));
}

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

const matrix = parseMatrix();
const gallery = gallerySurfaces();
const consumers = [...sourceFiles(join(root, "apps")), ...sourceFiles(join(root, "packages"))].map((file) => ({ file, text: readFileSync(file, "utf8") }));

const wrappers = readdirSync(COMPONENTS).filter((name) => name.endsWith(".tsx")).sort();
const rows = wrappers.map((file) => {
  const name = file.replace(/\.tsx$/, "");
  const source = readFileSync(join(COMPONENTS, file), "utf8");
  const primitive = /@base-ui\/react\/([a-z-]+)/.exec(source)?.[1] ?? null;
  const key = primitive ?? name;
  const importPattern = new RegExp(`components/${name}["']`);
  const importers = consumers.filter(({ file: path, text }) => !path.endsWith(`components${"\\"}${file}`) && importPattern.test(text)).length;
  const target = matrix.get(key) ?? matrix.get(name) ?? null;
  return {
    wrapper: name,
    file: `packages/ui/src/components/${file}`,
    basePrimitive: primitive,
    origin: primitive ? "base-ui" : name.startsWith("toriyama-") ? "shenron" : "shadcn-style",
    tailwindClassStrings: (source.match(/className=|cn\(|cva\(/g) ?? []).length,
    gpui: target ? { module: target.gpui, status: target.status, effort: target.effort } : { module: null, status: "unknown", effort: null },
    importers,
    galleryCovered: gallery.has(key) || gallery.has(name),
    parity: "unmeasured",
  };
});

const ledger = {
  generatedFrom: ["packages/ui/src/components", "docs/plans/base-ui-gpui-parity-matrix.md", "scripts/parity/states.json"],
  counts: {
    wrappers: rows.length,
    withBasePrimitive: rows.filter((row) => row.basePrimitive).length,
    gpuiFull: rows.filter((row) => row.gpui.status === "full").length,
    gpuiPartial: rows.filter((row) => row.gpui.status === "partial").length,
    gpuiMissing: rows.filter((row) => row.gpui.status === "missing").length,
    gpuiUnknown: rows.filter((row) => row.gpui.status === "unknown").length,
    galleryCovered: rows.filter((row) => row.galleryCovered).length,
  },
  rows: rows.sort((a, b) => b.importers - a.importers || a.wrapper.localeCompare(b.wrapper)),
};
const output = `${JSON.stringify(ledger, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = existsSync(LEDGER) ? readFileSync(LEDGER, "utf8") : "";
  if (current !== output) {
    console.error("migration/ui.json is stale: run `bun scripts/migration/ui-ledger.ts`");
    process.exit(1);
  }
  console.log(`migration/ui.json up to date (${rows.length} wrappers)`);
} else {
  writeFileSync(LEDGER, output);
  console.log(JSON.stringify(ledger.counts));
  console.log(ledger.rows.slice(0, 12).map((row) => `${String(row.importers).padStart(3)} importers  ${row.wrapper.padEnd(18)} ${row.origin.padEnd(12)} gpui:${row.gpui.status}${row.galleryCovered ? "  gallery" : ""}`).join("\n"));
}
