#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Public-API difference between two `wgpu` releases, from their rustdoc JSON.
 *
 *   bun .claude/skills/wgpu-30/scripts/api-diff.ts --old <dir> --new <dir> [--out <file>]
 *
 * Each directory holds `wgpu.json` and `wgpu_types.json` (see `rustdoc-json.ts`). The report lists
 * items added and removed, and for the items in both: fields, variants, methods, associated
 * constants and trait items that were added, removed or changed signature. It compares what a
 * downstream crate can name, so a pure move between `wgpu-types` modules is not a change.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type Krate,
  type PublicItem,
  aliasTarget,
  collectPublic,
  constantDecl,
  enumVariants,
  kindOf,
  loadCrate,
  members,
  renderFunction,
  resolveAlias,
  structFields,
  typeGenerics,
} from "./rustdoc-model";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!option("--old") || !option("--new"))
  throw new Error("usage: api-diff.ts --old <dir> --new <dir> [--out <file>]");

interface Snapshot {
  version: string;
  items: Map<string, { kind: string; shape: string[]; members: Map<string, string> }>;
}

function snapshot(dir: string): Snapshot {
  const wgpu = loadCrate(join(resolve(dir), "wgpu.json"), "wgpu");
  const wgt = loadCrate(join(resolve(dir), "wgpu_types.json"), "wgpu_types");
  const crates: Krate[] = [wgpu, wgt];
  const items: Snapshot["items"] = new Map();
  for (const p of collectPublic(wgpu, [wgt])) {
    if (p.kind === "module") continue;
    const target: PublicItem = resolveAlias(p, crates) ?? p;
    const kind = kindOf(target.item);
    const shape: string[] = [];
    const memberMap = new Map<string, string>();
    if (p.kind === "type_alias") shape.push(`= ${aliasTarget(p)}`);
    if (p.kind === "function") shape.push(renderFunction(p.item));
    if (p.kind === "constant") shape.push(constantDecl(p));
    if (kind === "struct") {
      shape.push(`generics ${typeGenerics(target) || "-"}`);
      const { fields, hidden } = structFields(target);
      for (const f of fields) shape.push(`${f.name}: ${f.type}`);
      if (hidden) shape.push("(private fields)");
    } else if (kind === "enum") {
      shape.push(`generics ${typeGenerics(target) || "-"}`);
      for (const v of enumVariants(target)) shape.push(`${v.name}${v.shape}`);
    }
    if (kind === "struct" || kind === "enum" || kind === "trait") {
      for (const m of members(target)) memberMap.set(m.name, m.decl);
    }
    items.set(p.path, { kind: p.kind, shape, members: memberMap });
  }
  return { version: wgpu.version, items };
}

const before = snapshot(option("--old")!);
const after = snapshot(option("--new")!);

const removed: string[] = [];
const added: string[] = [];
const changed: string[] = [];
for (const [path, old] of before.items) {
  const now = after.items.get(path);
  if (!now) {
    removed.push(`- \`${path.replace(/^wgpu::/, "")}\` (${old.kind})`);
    continue;
  }
  const lines: string[] = [];
  const oldShape = new Set(old.shape);
  const newShape = new Set(now.shape);
  for (const s of old.shape) if (!newShape.has(s)) lines.push(`  - − \`${s}\``);
  for (const s of now.shape) if (!oldShape.has(s)) lines.push(`  - + \`${s}\``);
  for (const [name, decl] of old.members) {
    const next = now.members.get(name);
    if (next === undefined) lines.push(`  - − method/const \`${decl}\``);
    else if (next !== decl) lines.push(`  - ~ \`${decl}\` → \`${next}\``);
  }
  for (const [name, decl] of now.members)
    if (!old.members.has(name)) lines.push(`  - + method/const \`${decl}\``);
  if (lines.length) changed.push(`- \`${path.replace(/^wgpu::/, "")}\` (${now.kind})`, ...lines);
}
for (const [path, now] of after.items) {
  if (!before.items.has(path)) added.push(`- \`${path.replace(/^wgpu::/, "")}\` (${now.kind})`);
}

const out = [
  `# wgpu ${before.version} → ${after.version}: public API difference`,
  "",
  `> Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/api-diff.ts\` from the rustdoc JSON of both releases (\`wgpu\` + \`wgpu-types\`). Names are as a downstream crate writes them (\`wgpu::X\`). \`−\` removed, \`+\` added, \`~\` signature changed.`,
  "",
  `Items before: ${before.items.size}, after: ${after.items.size}. Removed: ${removed.length}, added: ${added.length}, changed: ${changed.filter((l) => l.startsWith("- ")).length}.`,
  "",
  "## Removed",
  "",
  ...(removed.length ? removed : ["(none)"]),
  "",
  "## Added",
  "",
  ...(added.length ? added : ["(none)"]),
  "",
  "## Changed",
  "",
  ...(changed.length ? changed : ["(none)"]),
  "",
].join("\n");
const target = option("--out");
if (target) writeFileSync(resolve(target), out);
else console.log(out);
console.log(
  `removed ${removed.length}, added ${added.length}, changed ${changed.filter((l) => l.startsWith("- ")).length}`,
);
