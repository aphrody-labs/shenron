#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Writes the Markdown API map of `wgpu` (references/api/*.md) from rustdoc JSON.
 *
 *   bun .claude/skills/wgpu-30/scripts/build-references.ts --json <dir> [--out <dir>]
 *
 * `<dir>` holds `wgpu.json`, `wgpu_types.json` and `naga.json`, produced by `rustdoc-json.ts`
 * (nightly `cargo rustdoc -- -Z unstable-options --output-format json`). The map lists every
 * public item of `wgpu` under the name a downstream crate uses, with signatures, fields, variants,
 * feature flags and the first paragraph of each doc comment, grouped by the source file that defines
 * it. Nothing is paraphrased: a line of the map is a line of the released source.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type Krate,
  type PublicItem,
  aliasTarget,
  collectPublic,
  constantDecl,
  enumVariants,
  firstParagraph,
  kindOf,
  loadCrate,
  members,
  renderFunction,
  renderMarkers,
  resolveAlias,
  sourceFile,
  structFields,
  traitImpls,
  typeGenerics,
} from "./rustdoc-model";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const jsonDir = resolve(option("--json") ?? "");
const outDir = resolve(option("--out") ?? join(import.meta.dir, "..", "references", "api"));
if (!option("--json")) throw new Error("usage: build-references.ts --json <dir> [--out <dir>]");

const wgpu = loadCrate(join(jsonDir, "wgpu.json"), "wgpu");
const wgt = loadCrate(join(jsonDir, "wgpu_types.json"), "wgpu_types");
const crates: Krate[] = [wgpu, wgt];
const api = collectPublic(wgpu, [wgt]);

/** Output file of an item, from the source file that defines it. */
const AREAS: { file: string; title: string; match: RegExp }[] = [
  { file: "01-instance-adapter-device-queue", title: "Instance, adapter, device, queue", match: /^(wgpu\/)?src\/(api\/(instance|adapter|device|queue)|instance|adapter|device|backend|counters|tokens|error|math)\.rs$|^src\/(api\/mod|backend\/wgpu_core)\.rs$/ },
  { file: "02-buffers-textures-samplers", title: "Buffers, textures, samplers, queries", match: /^src\/(api\/(buffer|texture|texture_view|sampler|query_set|external_texture)|buffer|texture|origin_extent|write_only|transfers|texture\/external_(image|texture))\.rs$/ },
  { file: "03-commands-and-passes", title: "Command encoding, render and compute passes, bundles", match: /^src\/(api\/(command_encoder|command_buffer|render_pass|compute_pass|render_bundle|render_bundle_encoder)|util\/encoder)\.rs$/ },
  { file: "04-render-state", title: "Render state: primitive, blend, depth/stencil, multisample", match: /^src\/render\.rs$/ },
  { file: "05-pipelines-shaders-bindings", title: "Pipelines, shaders, bind groups, vertex layouts", match: /^src\/(api\/(bind_group|bind_group_layout|pipeline_layout|render_pipeline|compute_pipeline|shader_module|pipeline_cache|common_pipeline)|binding|shader|vertex)\.rs$/ },
  { file: "06-surface-presentation", title: "Surface and presentation", match: /^src\/(api\/(surface|surface_texture)|surface)\.rs$/ },
  { file: "07-features-limits", title: "Features and limits", match: /^src\/(features|limits)\.rs$/ },
  { file: "08-texture-formats", title: "Texture formats", match: /^src\/texture\/format\.rs$/ },
  { file: "09-ray-tracing", title: "Ray tracing (BLAS, TLAS)", match: /^src\/(api\/(blas|tlas)|ray_tracing)\.rs$/ },
  { file: "10-util", title: "wgpu::util helpers", match: /^src\/util\// },
];

const areaOf = (p: PublicItem): string => {
  const file = sourceFile(p.item);
  const hit = AREAS.find((a) => a.match.test(file));
  return hit ? hit.file : p.krate.name === "wgpu_types" && file === "src/lib.rs" ? "01-instance-adapter-device-queue" : "11-misc";
};
const titleOf = (file: string): string => AREAS.find((a) => a.file === file)?.title ?? "Everything else";

const esc = (text: string): string => text.replaceAll("|", "\\|");
const code = (text: string): string => `\`${text.replaceAll("`", "'")}\``;
const markers = (m: string[]): string => (m.length ? ` _[${m.join("; ")}]_` : "");

function renderMembers(p: PublicItem, source = p): string[] {
  const lines: string[] = [];
  for (const m of members(source)) {
    lines.push(`- ${code(m.decl)}${m.doc ? ` — ${esc(m.doc)}` : ""}${markers(m.markers)}`);
  }
  return lines;
}

function renderItem(p: PublicItem): string {
  const alias = resolveAlias(p, crates);
  const target = alias ?? p;
  const kind = kindOf(target.item);
  const head: string[] = [];
  const mk = markers(renderMarkers(p.item));
  const generics = kind === "struct" || kind === "enum" || kind === "trait" ? typeGenerics(target) : "";
  if (p.kind === "type_alias") {
    head.push(`### ${p.name} — type alias${mk}`, "", `${code(`type ${p.name} = ${aliasTarget(p)}`)}`);
  } else if (p.kind === "function") {
    head.push(`### ${p.name} — function${mk}`, "", code(renderFunction(p.item, p.path.replace(/^wgpu::/, ""))));
  } else if (p.kind === "constant") {
    head.push(`### ${p.name} — constant`, "", code(constantDecl(p)));
  } else if (p.kind === "macro") {
    head.push(`### ${p.name}! — macro`);
  } else {
    head.push(`### ${p.name}${generics ? code(generics) : ""} — ${p.kind}${mk}`);
  }
  const doc = firstParagraph(target.item.docs ?? p.item.docs, 420);
  if (doc) head.push("", doc);

  const body: string[] = [];
  if (kind === "struct") {
    const { fields, tuple, hidden } = structFields(target);
    if (fields.length) {
      body.push("", tuple ? "Fields (tuple):" : "Fields:");
      for (const f of fields) body.push(`- ${code(`${f.name}: ${f.type}`)}${f.doc ? ` — ${esc(f.doc)}` : ""}`);
      if (hidden) body.push("- (private fields omitted)");
    } else if (hidden) body.push("", "Opaque (private fields).");
  } else if (kind === "enum") {
    const variants = enumVariants(target);
    body.push("", `Variants (${variants.length}):`);
    for (const v of variants) body.push(`- ${code(`${v.name}${v.shape}`)}${v.doc ? ` — ${esc(v.doc)}` : ""}`);
  }
  if (kind === "struct" || kind === "enum" || kind === "trait") {
    const m = renderMembers(p, target);
    if (m.length) body.push("", kind === "trait" ? "Items:" : "Methods and constants:", ...m);
    const impls = traitImpls(target);
    if (impls.length) body.push("", `Implements: ${impls.map(code).join(", ")}`);
  }
  return [...head, ...body, ""].join("\n");
}

mkdirSync(outDir, { recursive: true });
const byArea = new Map<string, PublicItem[]>();
for (const p of api) {
  if (p.kind === "module") continue;
  const area = areaOf(p);
  byArea.set(area, [...(byArea.get(area) ?? []), p]);
}

const generated = new Date().toISOString().slice(0, 10);

// The user guide of the crate (crate-level docs: platforms, features, environment, shaders).
const rootDocs = wgpu.index.get(wgpu.root)?.docs ?? "";
writeFileSync(
  join(outDir, "..", "crate-docs.md"),
  [
    `# wgpu ${wgpu.version} — crate-level documentation (verbatim)`,
    "",
    `> Copied ${generated} from the doc comment of the \`wgpu\` crate root (docs.rs/wgpu/${wgpu.version}). Official text, not paraphrased; image links point at the upstream repository.`,
    "",
    rootDocs,
    "",
  ].join("\n"),
);
for (const mod of ["util", "spirv"]) {
  const item = [...wgpu.index.values()].find((i) => i.name === mod && i.inner.module && i.docs);
  if (item?.docs) console.log(`module ${mod}: ${item.docs.length} chars of docs`);
}
const header = (title: string, count: number): string =>
  [
    `# wgpu ${wgpu.version} API map — ${title}`,
    "",
    `> Generated ${generated} by \`scripts/build-references.ts\` from the rustdoc JSON (format ${wgpu.formatVersion}) of \`wgpu\` ${wgpu.version} and \`wgpu-types\` ${wgt.version}. Do not edit: regenerate (see ../../SKILL.md). ${count} public items.`,
    "",
  ].join("\n");

const index: string[] = [
  `# wgpu ${wgpu.version} API map — index`,
  "",
  `> Generated ${generated}. One line per public item: \`rg -n '^### Name' references/api\` finds its entry.`,
  "",
];
const files = [...AREAS.map((a) => a.file), "11-misc"];
for (const file of files) {
  const items = (byArea.get(file) ?? []).toSorted((a, b) => a.name.localeCompare(b.name));
  if (!items.length) continue;
  const text = [header(titleOf(file), items.length), ...items.map(renderItem)].join("\n");
  writeFileSync(join(outDir, `${file}.md`), text);
  index.push(`## ${titleOf(file)} (${file}.md)`, "", items.map((p) => `${p.name}`).join(", "), "");
  console.log(`${file}.md: ${items.length} items, ${(text.length / 1024).toFixed(0)} KiB`);
}
writeFileSync(join(outDir, "00-index.md"), index.join("\n"));
console.log(`${api.filter((p) => p.kind !== "module").length} public items of wgpu ${wgpu.version}`);

// ── naga (shader front ends, back ends, validation) ──────────────────────────────────────────
import { existsSync } from "node:fs";

const nagaFile = join(jsonDir, "naga.json");
if (existsSync(nagaFile)) {
  const naga = loadCrate(nagaFile, "naga");
  crates.push(naga);
  const items = collectPublic(naga, []).filter((p) => p.kind !== "module");
  const moduleOf = (p: PublicItem): string => p.path.split("::")[1] && p.path.split("::").length > 2 ? p.path.split("::")[1]! : "(root)";
  const heavy = new Set(["ir", "proc"]);
  const full: string[] = [];
  const names = new Map<string, string[]>();
  for (const p of items.toSorted((a, b) => a.path.localeCompare(b.path))) {
    const mod = moduleOf(p);
    if (heavy.has(mod)) names.set(mod, [...(names.get(mod) ?? []), p.name]);
    else full.push(renderItem({ ...p, name: p.path.replace(/^naga::/, "") }));
  }
  const nagaHeader = [
    `# naga ${naga.version} API map`,
    "",
    `> Generated ${generated} from the rustdoc JSON (format ${naga.formatVersion}) of \`naga\` ${naga.version} (front ends WGSL/SPIR-V/GLSL, back ends WGSL/SPIR-V/MSL/HLSL/GLSL, validation). The intermediate representation (\`ir\`) and the procedural helpers (\`proc\`) are listed by name only. Do not edit: regenerate (see ../SKILL.md).`,
    "",
  ].join("\n");
  const tail = [...names].flatMap(([mod, list]) => [`## naga::${mod} (names only)`, "", list.join(", "), ""]);
  const text = [nagaHeader, ...full, ...tail].join("\n");
  writeFileSync(join(outDir, "..", "naga-api.md"), text);
  console.log(`naga-api.md: ${items.length} items, ${(text.length / 1024).toFixed(0)} KiB`);
}
