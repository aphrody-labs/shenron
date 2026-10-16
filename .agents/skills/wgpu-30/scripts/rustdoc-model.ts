/* oxlint-disable unicorn/no-array-sort -- reviewed: legacy patterns, behavior preserved */
// SPDX-License-Identifier: Apache-2.0
/**
 * Reads the rustdoc JSON (format 61, nightly) of `wgpu`, `wgpu-types` and `naga` and exposes the
 * public API of `wgpu` as a flat, normalised list: every item a downstream crate can name as
 * `wgpu::<Name>`, with re-exports from `wgpu-types` resolved to their definitions.
 *
 * Used by `build-references.ts` (the Markdown API map of the skill) and `api-diff.ts` (the
 * public-API difference between two releases). Nothing here depends on the repository.
 */
import { readFileSync } from "node:fs";

export type Id = number;

export interface RItem {
  id: Id;
  crate_id: number;
  name: string | null;
  span: { filename: string } | null;
  visibility: unknown;
  docs: string | null;
  attrs: unknown[];
  deprecation: { since?: string | null; note?: string | null } | null;
  inner: Record<string, any>;
}

export interface Krate {
  /** Crate name with underscores (`wgpu_types`). */
  name: string;
  version: string;
  root: Id;
  index: Map<Id, RItem>;
  paths: Record<string, { crate_id: number; path: string[]; kind: string }>;
  /** `wgpu_types::adapter::RequestAdapterOptions` → local item id. */
  byPath: Map<string, Id>;
  formatVersion: number;
}

export function loadCrate(file: string, name: string): Krate {
  const json = JSON.parse(readFileSync(file, "utf8"));
  const index = new Map<Id, RItem>();
  for (const [id, item] of Object.entries<RItem>(json.index)) index.set(Number(id), item);
  const byPath = new Map<string, Id>();
  for (const [id, info] of Object.entries<{ crate_id: number; path: string[] }>(json.paths)) {
    if (info.crate_id === 0) byPath.set(info.path.join("::"), Number(id));
  }
  return {
    name,
    version: json.crate_version,
    root: json.root,
    index,
    paths: json.paths,
    byPath,
    formatVersion: json.format_version,
  };
}

export type Kind =
  | "module"
  | "struct"
  | "enum"
  | "trait"
  | "function"
  | "type_alias"
  | "constant"
  | "static"
  | "macro";

export interface PublicItem {
  /** Name a downstream crate uses: `wgpu::Device`, `wgpu::util::DeviceExt`. */
  path: string;
  name: string;
  kind: Kind;
  item: RItem;
  krate: Krate;
}

const KINDS = new Set<string>([
  "module",
  "struct",
  "enum",
  "trait",
  "function",
  "type_alias",
  "constant",
  "static",
  "macro",
]);

export const kindOf = (item: RItem): string => Object.keys(item.inner)[0]!;

const isPublic = (item: RItem): boolean =>
  item.visibility === "public" || item.visibility === "default";

/** Every public item of `root` (a crate re-exporting `others`), by the name it is used under. */
export function collectPublic(root: Krate, others: Krate[]): PublicItem[] {
  const crates = new Map<string, Krate>([[root.name, root], ...others.map((k) => [k.name, k] as const)]);
  const out = new Map<string, PublicItem>();
  const seenModules = new Set<string>();

  const add = (krate: Krate, item: RItem, prefix: string, name: string): void => {
    const kind = kindOf(item);
    if (!KINDS.has(kind)) return;
    const path = `${prefix}::${name}`;
    if (!out.has(path)) out.set(path, { path, name, kind: kind as Kind, item, krate });
  };

  const visitModule = (krate: Krate, moduleId: Id, prefix: string): void => {
    const key = `${krate.name}:${moduleId}:${prefix}`;
    if (seenModules.has(key)) return;
    seenModules.add(key);
    const module = krate.index.get(moduleId);
    if (!module?.inner.module) return;
    for (const childId of module.inner.module.items as Id[]) {
      const child = krate.index.get(childId);
      if (!child) continue;
      const kind = kindOf(child);
      if (kind === "use") {
        if (!isPublic(child)) continue;
        const use = child.inner.use as { name: string; id: Id | null; is_glob: boolean };
        if (use.id == null) continue;
        const local = krate.index.get(use.id);
        if (local) {
          if (kindOf(local) === "module") {
            visitModule(krate, use.id, use.is_glob ? prefix : `${prefix}::${use.name}`);
          } else if (!use.is_glob) add(krate, local, prefix, use.name);
          continue;
        }
        // Defined in another crate of the family: follow the path rustdoc recorded.
        const info = krate.paths[String(use.id)];
        if (!info) continue;
        const target = crates.get(info.path[0]!);
        const targetId = target?.byPath.get(info.path.join("::"));
        const targetItem = targetId == null ? undefined : target?.index.get(targetId);
        if (!target || !targetItem) continue;
        if (kindOf(targetItem) === "module") {
          visitModule(target, targetId!, use.is_glob ? prefix : `${prefix}::${use.name}`);
        } else if (!use.is_glob) add(target, targetItem, prefix, use.name);
        continue;
      }
      if (!isPublic(child) || !child.name) continue;
      if (kind === "module") {
        add(krate, child, prefix, child.name);
        visitModule(krate, childId, `${prefix}::${child.name}`);
      } else add(krate, child, prefix, child.name);
    }
  };

  visitModule(root, root.root, root.name);
  return [...out.values()];
}

// ── Rendering ────────────────────────────────────────────────────────────────────────────────

const clean = (path: string): string => path.replace(/^(wgt|crate)::/, "");

function renderArgs(args: any): string {
  if (!args) return "";
  if (args.angle_bracketed) {
    const parts: string[] = [];
    for (const a of args.angle_bracketed.args as any[]) {
      if (a.type) parts.push(renderType(a.type));
      else if (a.lifetime) parts.push(a.lifetime);
      else if (a.const) parts.push(String(a.const.expr ?? a.const.value ?? "_"));
      else parts.push("_");
    }
    for (const c of args.angle_bracketed.constraints as any[]) {
      const binding = c.binding;
      if (binding?.equality?.type) parts.push(`${c.name} = ${renderType(binding.equality.type)}`);
      else parts.push(String(c.name));
    }
    return parts.length ? `<${parts.join(", ")}>` : "";
  }
  if (args.parenthesized) {
    const inputs = (args.parenthesized.inputs as any[]).map(renderType).join(", ");
    const output = args.parenthesized.output ? ` -> ${renderType(args.parenthesized.output)}` : "";
    return `(${inputs})${output}`;
  }
  return "";
}

function renderPath(p: any): string {
  return `${clean(p.path)}${renderArgs(p.args)}`;
}

function renderBounds(bounds: any[]): string {
  return bounds
    .map((b) => {
      if (b.trait_bound) {
        const mod = b.trait_bound.modifier === "maybe" ? "?" : "";
        return `${mod}${renderPath(b.trait_bound.trait)}`;
      }
      if (b.outlives) return String(b.outlives);
      return "_";
    })
    .join(" + ");
}

export function renderType(t: any): string {
  if (t == null) return "()";
  if (t.primitive) return t.primitive;
  if (t.generic) return t.generic;
  if (t.resolved_path) return renderPath(t.resolved_path);
  if (t.borrowed_ref) {
    const r = t.borrowed_ref;
    return `&${r.lifetime ? `${r.lifetime} ` : ""}${r.is_mutable ? "mut " : ""}${renderType(r.type)}`;
  }
  if (t.raw_pointer) return `*${t.raw_pointer.is_mutable ? "mut" : "const"} ${renderType(t.raw_pointer.type)}`;
  if (t.tuple) return `(${(t.tuple as any[]).map(renderType).join(", ")})`;
  if (t.slice) return `[${renderType(t.slice)}]`;
  if (t.array) return `[${renderType(t.array.type)}; ${t.array.len}]`;
  if (t.impl_trait) return `impl ${renderBounds(t.impl_trait)}`;
  if (t.dyn_trait) {
    const traits = (t.dyn_trait.traits as any[]).map((x) => renderPath(x.trait)).join(" + ");
    return `dyn ${traits}${t.dyn_trait.lifetime ? ` + ${t.dyn_trait.lifetime}` : ""}`;
  }
  if (t.qualified_path) {
    const q = t.qualified_path;
    const self = renderType(q.self_type);
    return q.trait ? `<${self} as ${renderPath(q.trait)}>::${q.name}` : `${self}::${q.name}`;
  }
  if (t.function_pointer) {
    const sig = t.function_pointer.sig;
    const inputs = (sig.inputs as any[]).map(([, ty]) => renderType(ty)).join(", ");
    return `fn(${inputs})${sig.output ? ` -> ${renderType(sig.output)}` : ""}`;
  }
  if (t.infer !== undefined) return "_";
  return "?";
}

function renderGenerics(g: any): { params: string; where: string } {
  const params: string[] = [];
  for (const p of (g?.params ?? []) as any[]) {
    if (p.kind?.type?.is_synthetic) continue;
    if (p.kind === undefined) continue;
    if (p.kind.lifetime) {
      const out = (p.kind.lifetime.outlives as string[]).length
        ? `: ${(p.kind.lifetime.outlives as string[]).join(" + ")}`
        : "";
      params.push(`${p.name}${out}`);
    } else if (p.kind.type) {
      const bounds = (p.kind.type.bounds as any[]).length ? `: ${renderBounds(p.kind.type.bounds)}` : "";
      const def = p.kind.type.default ? ` = ${renderType(p.kind.type.default)}` : "";
      params.push(`${p.name}${bounds}${def}`);
    } else if (p.kind.const) {
      params.push(`const ${p.name}: ${renderType(p.kind.const.type)}`);
    }
  }
  const preds: string[] = [];
  for (const w of (g?.where_predicates ?? []) as any[]) {
    if (w.bound_predicate) preds.push(`${renderType(w.bound_predicate.type)}: ${renderBounds(w.bound_predicate.bounds)}`);
    else if (w.lifetime_predicate) preds.push(`${w.lifetime_predicate.lifetime}: ${(w.lifetime_predicate.outlives as string[]).join(" + ")}`);
  }
  return {
    params: params.length ? `<${params.join(", ")}>` : "",
    where: preds.length ? ` where ${preds.join(", ")}` : "",
  };
}

/** `fn name<T>(&self, a: A) -> R` of a function item. */
export function renderFunction(item: RItem, name = item.name ?? "_"): string {
  const f = item.inner.function;
  const { params, where } = renderGenerics(f.generics);
  const inputs = (f.sig.inputs as [string, any][]).map(([n, ty]) => {
    const rendered = renderType(ty);
    if (n === "self") return rendered === "&Self" ? "&self" : rendered === "&mut Self" ? "&mut self" : rendered === "Self" ? "self" : `self: ${rendered}`;
    return `${n}: ${rendered}`;
  });
  const h = f.header;
  const prefix = `${h.is_const ? "const " : ""}${h.is_async ? "async " : ""}${h.is_unsafe ? "unsafe " : ""}`;
  const out = f.sig.output ? ` -> ${renderType(f.sig.output)}` : "";
  return `${prefix}fn ${name}${params}(${inputs.join(", ")})${out}${where}`;
}

export function firstParagraph(docs: string | null, max = 220): string {
  if (!docs) return "";
  const para = docs.trim().split(/\n\s*\n/)[0]!.replace(/\s+/g, " ").trim();
  return para.length > max ? `${para.slice(0, max - 1).trimEnd()}…` : para;
}

/** `cfg(...)`/`must_use`/`non_exhaustive` markers of an item, for the API map. */
export function renderMarkers(item: RItem): string[] {
  const markers: string[] = [];
  for (const a of item.attrs ?? []) {
    const text = typeof a === "string" ? a : JSON.stringify(a);
    const cfg = /cfg\(([^)]*(?:\([^)]*\))?[^)]*)\)/.exec(text);
    if (cfg) markers.push(`cfg(${cfg[1]})`);
    if (/must_use/.test(text)) markers.push("must_use");
    if (/non_exhaustive/.test(text)) markers.push("non_exhaustive");
  }
  if (item.deprecation) markers.push(`deprecated${item.deprecation.note ? `: ${item.deprecation.note}` : ""}`);
  return [...new Set(markers)];
}

export interface Member {
  name: string;
  /** Rendered declaration. */
  decl: string;
  doc: string;
  markers: string[];
}

/** Public inherent methods and associated constants of a struct, enum or trait. */
export function members(p: PublicItem): Member[] {
  const { krate, item } = p;
  const kind = kindOf(item);
  const out: Member[] = [];
  const pushFn = (fn: RItem): void => {
    out.push({ name: fn.name ?? "_", decl: renderFunction(fn), doc: firstParagraph(fn.docs), markers: renderMarkers(fn) });
  };
  if (kind === "trait") {
    for (const id of item.inner.trait.items as Id[]) {
      const m = krate.index.get(id);
      if (!m) continue;
      const mk = kindOf(m);
      if (mk === "function") pushFn(m);
      else if (mk === "assoc_type") out.push({ name: m.name ?? "_", decl: `type ${m.name}`, doc: firstParagraph(m.docs), markers: [] });
      else if (mk === "assoc_const") out.push({ name: m.name ?? "_", decl: `const ${m.name}: ${renderType(m.inner.assoc_const.type)}`, doc: firstParagraph(m.docs), markers: [] });
    }
    return out;
  }
  const impls: Id[] = item.inner[kind]?.impls ?? [];
  for (const implId of impls) {
    const impl = krate.index.get(implId);
    if (!impl || impl.inner.impl?.trait) continue;
    for (const id of impl.inner.impl.items as Id[]) {
      const m = krate.index.get(id);
      if (!m || !isPublic(m)) continue;
      const mk = kindOf(m);
      if (mk === "function") pushFn(m);
      else if (mk === "assoc_const") {
        out.push({
          name: m.name ?? "_",
          decl: `const ${m.name}: ${renderType(m.inner.assoc_const.type)}`,
          doc: firstParagraph(m.docs, 160),
          markers: renderMarkers(m),
        });
      }
    }
  }
  return out;
}

/** Public traits an item implements (derives and manual impls; blanket and auto traits left out). */
export function traitImpls(p: PublicItem): string[] {
  const { krate, item } = p;
  const kind = kindOf(item);
  const names = new Set<string>();
  for (const implId of (item.inner[kind]?.impls ?? []) as Id[]) {
    const impl = krate.index.get(implId)?.inner.impl;
    if (!impl?.trait || impl.is_synthetic || impl.blanket_impl || impl.is_negative) continue;
    names.add(renderPath(impl.trait));
  }
  return [...names].sort();
}

export interface Field {
  name: string;
  type: string;
  doc: string;
}

export function structFields(p: PublicItem): { fields: Field[]; tuple: boolean; hidden: boolean } {
  const s = p.item.inner.struct;
  const fields: Field[] = [];
  let hidden = false;
  if (s.kind === "unit") return { fields, tuple: false, hidden };
  const tuple = Boolean(s.kind.tuple);
  const ids: (Id | null)[] = tuple ? s.kind.tuple : s.kind.plain.fields;
  hidden = tuple ? ids.some((id) => id == null) : Boolean(s.kind.plain.has_stripped_fields);
  for (const id of ids) {
    if (id == null) continue;
    const f = p.krate.index.get(id);
    if (!f || !isPublic(f)) {
      hidden = true;
      continue;
    }
    fields.push({ name: f.name ?? "_", type: renderType(f.inner.struct_field), doc: firstParagraph(f.docs, 180) });
  }
  return { fields, tuple, hidden };
}

export interface Variant {
  name: string;
  shape: string;
  doc: string;
}

export function enumVariants(p: PublicItem): Variant[] {
  const out: Variant[] = [];
  for (const id of p.item.inner.enum.variants as Id[]) {
    const v = p.krate.index.get(id);
    if (!v) continue;
    const kind = v.inner.variant.kind;
    let shape = "";
    if (kind.tuple) shape = `(${(kind.tuple as (Id | null)[]).map((fid) => (fid == null ? "_" : renderType(p.krate.index.get(fid)?.inner.struct_field))).join(", ")})`;
    else if (kind.struct) {
      const fields = (kind.struct.fields as Id[]).map((fid) => {
        const f = p.krate.index.get(fid);
        return `${f?.name}: ${renderType(f?.inner.struct_field)}`;
      });
      shape = ` { ${fields.join(", ")} }`;
    }
    const discriminant = v.inner.variant.discriminant ? ` = ${v.inner.variant.discriminant.expr}` : "";
    out.push({ name: v.name ?? "_", shape: `${shape}${discriminant}`, doc: firstParagraph(v.docs, 200) });
  }
  return out;
}

export function typeGenerics(p: PublicItem): string {
  const inner = p.item.inner[kindOf(p.item)];
  return renderGenerics(inner.generics).params;
}

export function aliasTarget(p: PublicItem): string {
  return renderType(p.item.inner.type_alias.type);
}

export function constantDecl(p: PublicItem): string {
  const c = p.item.inner.constant;
  return `const ${p.name}: ${renderType(c.type)} = ${c.const?.expr ?? c.const?.value ?? "…"}`;
}

/** Source file of an item relative to its crate root (`src/api/device.rs`). */
export function sourceFile(item: RItem): string {
  const f = item.span?.filename ?? "";
  // …/registry/src/index.crates.io-…/wgpu-30.0.1/src/api/device.rs → src/api/device.rs
  const m = /\/[A-Za-z0-9_.-]+-\d+\.\d+\.\d+[^/]*\/(src\/.+)$/.exec(f);
  if (m) return m[1]!;
  const i = f.lastIndexOf("/src/");
  return i >= 0 ? f.slice(i + 1) : f;
}

/** The struct, enum or trait a type alias names (`type SurfaceConfiguration = wgt::SurfaceConfiguration<…>`). */
export function resolveAlias(p: PublicItem, crates: Krate[]): PublicItem | null {
  if (p.kind !== "type_alias") return null;
  const rp = p.item.inner.type_alias.type?.resolved_path;
  if (!rp || rp.id == null) return null;
  const local = p.krate.index.get(rp.id);
  if (local) {
    const kind = kindOf(local);
    return KINDS.has(kind) ? { path: p.path, name: p.name, kind: kind as Kind, item: local, krate: p.krate } : null;
  }
  const info = p.krate.paths[String(rp.id)];
  if (!info) return null;
  const target = crates.find((k) => k.name === info.path[0]);
  const id = target?.byPath.get(info.path.join("::"));
  const item = id == null ? undefined : target?.index.get(id);
  if (!target || !item) return null;
  const kind = kindOf(item);
  return KINDS.has(kind) ? { path: p.path, name: p.name, kind: kind as Kind, item, krate: target } : null;
}
