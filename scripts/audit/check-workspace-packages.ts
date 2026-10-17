#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
//
// check-workspace-packages.ts — conformance and dependency graph of the @aphrody/shenron-* packages
// (docs/architecture/STACK.md §4.3). Thin CLI over @aphrody/shenron-config/guards.
//
// Usage:
//   bun scripts/audit/check-workspace-packages.ts                       # all checks, fail on violations missing from the baseline
//   bun scripts/audit/check-workspace-packages.ts --package @aphrody/shenron-db       # one package (app checks skipped)
//   bun scripts/audit/check-workspace-packages.ts --strict              # also fail while the `transitional` baseline is not empty
//   bun scripts/audit/check-workspace-packages.ts --write-baseline      # record current violations (new ones go to `transitional`)
//   bun scripts/audit/check-workspace-packages.ts --json                # machine-readable report on stdout
//
// Baseline: scripts/audit/check-workspace-packages.baseline.json (beside this file), two sections:
//   transitional  must be empty at the end of Phase 1 (--strict enforces it)
//   phase2        each entry cites a ticket of docs/architecture/STACK.md §7.3; listed on every run
// A baseline entry that no longer matches a violation is stale: warning only.
// Checks reported as `warn` never fail (none since wave 5: the "use client" reach is an error).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  PUBLIC_LIBRARY_FILES,
  pinnedAphrodyDependency,
  publicationViolations,
  publicFileViolations,
  type AphrodyArchivePin,
} from "./workspace-policy";
import {
  ASSET_CLASSES,
  checkBrowserBundles,
  checkEmptyEnvImports,
  checkNoEscapingImports,
  checkPackageRuntimes,
  RUNTIME_CLASSES,
  stripNonCode,
  type Offence,
} from "../../packages/config/src/guards";

const ROOT = resolve(import.meta.dir, "../..");
const BASELINE_FILE = join(import.meta.dir, "check-workspace-packages.baseline.json");

/**
 * Workspace packages checked against docs/architecture/STACK.md, all with every check: the
 * framework packages (§3.1–3.7) and the consumer packages (§3.8). `@aphrody/shenron-images` has no
 * runtime class map yet.
 */
const PACKAGES: Readonly<Record<string, string>> = {
  "@aphrody/shenron-config": "packages/config",
  "@aphrody/shenron-db": "packages/db",
  "@aphrody/shenron-dbxv2": "packages/dbxv2",
  "@aphrody/shenron-auth": "packages/auth",

  "@aphrody/shenron-api": "packages/api",
  "@aphrody/shenron-ui": "packages/ui",

  "@aphrody/shenron-koharu": "packages/koharu",
  "@aphrody/shenron-lexicon": "packages/lexicon",
  "@aphrody/shenron-media": "packages/media",
  "@aphrody/shenron-native": "packages/native",
  "@aphrody/shenron-pipeline": "packages/pipeline",
};

/**
 * The one package allowed to load native code: `@aphrody/shenron-native` binds shenron-ffi through
 * `bun:ffi` (CLAUDE.md, STACK §5). Everywhere else `bun:ffi` and `dlopen` stay offences.
 */
const FFI_OWNER = "@aphrody/shenron-native";
const FFI_RULES: ReadonlySet<string> = new Set(["bun-ffi", "dlopen", "aphrody-native"]);

/**
 * Allowed @aphrody/shenron-* edges (docs/architecture/STACK.md §4.1). `dev` edges are allowed only
 * in devDependencies. Anything not listed is forbidden.
 */
const ALLOWED_EDGES: Readonly<
  Record<string, { runtime: readonly string[]; dev: readonly string[] }>
> = {
  "@aphrody/shenron-config": { runtime: [], dev: [] },
  "@aphrody/shenron-db": { runtime: ["@aphrody/shenron-config"], dev: [] },
  "@aphrody/shenron-auth": { runtime: ["@aphrody/shenron-config"], dev: ["@aphrody/shenron-db"] },
  // Private DBXV2 access: reads the private database through the db subpath only (never public).
  "@aphrody/shenron-dbxv2": { runtime: ["@aphrody/shenron-db"], dev: [] },

  "@aphrody/shenron-api": {
    runtime: [
      "@aphrody/shenron-config",
      "@aphrody/shenron-db",
      "@aphrody/shenron-auth",
      "@aphrody/shenron-lexicon",
      "@aphrody/shenron-pipeline",
    ],
    dev: [],
  },
  // The UI layer hosts the Koharu editor (protocol, canvas), the studio (config/admin) and the
  // Koharu export of the pipeline; none of them depends back on @aphrody/shenron-ui.
  "@aphrody/shenron-ui": {
    runtime: ["@aphrody/shenron-config", "@aphrody/shenron-koharu", "@aphrody/shenron-pipeline"],
    dev: ["@aphrody/shenron-config"],
  },

  // Leaves: the Koharu client, the media helpers and the shenron-ffi binding.
  "@aphrody/shenron-koharu": { runtime: [], dev: [] },
  // The one ja/fr/en lexicon (data embedded, no I/O): a leaf every layer may read.
  "@aphrody/shenron-lexicon": { runtime: [], dev: [] },
  "@aphrody/shenron-media": { runtime: [], dev: [] },
  "@aphrody/shenron-native": { runtime: [], dev: [] },
  // Compute clients and the editorial pipeline; never @aphrody/shenron-api, @aphrody/shenron-auth or @aphrody/shenron-ui.
  "@aphrody/shenron-pipeline": {
    runtime: [
      "@aphrody/shenron-config",
      "@aphrody/shenron-db",
      "@aphrody/shenron-koharu",
      "@aphrody/shenron-lexicon",
      "@aphrody/shenron-media",
      "@aphrody/shenron-native",
    ],
    dev: [],
  },
};

/** Subpath restrictions on allowed package edges. */
const EDGE_SUBPATHS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  "@aphrody/shenron-dbxv2": { "@aphrody/shenron-db": ["@aphrody/shenron-db/dbxv2"] },
  // Chat engine doctrine only (§4.1): personas and the agent home, never the pipeline runtime.
  "@aphrody/shenron-api": {
    "@aphrody/shenron-pipeline": [
      "@aphrody/shenron-pipeline/ai/prompts",
      "@aphrody/shenron-pipeline/agent-home",
      "@aphrody/shenron-pipeline/bxc/contracts",
    ],
  },
  "@aphrody/shenron-ui": {
    // The editor speaks the generated protocol and draws on the wasm canvas; the koharu-sdk
    // transport (`./native`, class bun) stays with the pipeline.
    "@aphrody/shenron-koharu": [
      "@aphrody/shenron-koharu/protocol",
      "@aphrody/shenron-koharu/canvas",
    ],
    // Koharu export panel only.
    "@aphrody/shenron-pipeline": ["@aphrody/shenron-pipeline/koharu"],
  },
  "@aphrody/shenron-pipeline": {
    // §4.2: SQL clients, environment and guards; Redis for the live qualification only
    // (src/testing/live-rag.ts and its storage suite check Redis durability itself).
    "@aphrody/shenron-db": [
      "@aphrody/shenron-db/sql",
      "@aphrody/shenron-db/bun-sql",
      "@aphrody/shenron-db/env",
      "@aphrody/shenron-db/guards",
      "@aphrody/shenron-db/redis",
      // Pure FTS query builder shared with the VFS retrieval (vector-reader).
      "@aphrody/shenron-db/vfs",
    ],
    // The koharu-sdk JSON Lines transport.
    "@aphrody/shenron-koharu": ["@aphrody/shenron-koharu/native"],
  },
};

/** Imports forbidden in a `"use client"` module (docs/architecture/STACK.md §4.2). */
const CLIENT_FORBIDDEN = [
  "@aphrody/shenron-db/postgres-js",
  "@aphrody/shenron-db/sql",
  "@aphrody/shenron-db/bun-sql",
  "@aphrody/shenron-api/server",
  "@aphrody/shenron-pipeline",
];

/** Explicitly pure entry points allowed from the site client despite a forbidden package root. */
const CLIENT_ALLOWED_PURE = new Set(["@aphrody/shenron-pipeline/re-wasm-web"]);

type Severity = "error" | "warn";

interface Violation {
  /** Stable identity used by the baseline. */
  id: string;
  scope: string;
  check: string;
  detail: string;
  severity: Severity;
}

interface BaselineEntry {
  id: string;
  reason?: string;
  ticket?: string;
}

interface Baseline {
  $comment?: string;
  transitional: BaselineEntry[];
  phase2: BaselineEntry[];
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = Bun.argv.slice(2);
const has = (name: string) => args.includes(name);
const option = (name: string): string | undefined => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    if (arg === name) return args[i + 1];
  }
  return undefined;
};
if (has("--help") || has("-h")) {
  console.log(
    "Usage: bun scripts/audit/check-workspace-packages.ts [--package <name>] [--strict] [--write-baseline] [--json]",
  );
  process.exit(0);
}
const ONLY = option("--package");
const STRICT = has("--strict");
const WRITE_BASELINE = has("--write-baseline");
const JSON_OUT = has("--json");
if (ONLY && !PACKAGES[ONLY]) {
  console.error(`unknown package ${ONLY}; expected one of ${Object.keys(PACKAGES).join(", ")}`);
  process.exit(2);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Manifest {
  name?: string;
  private?: boolean;
  main?: unknown;
  module?: unknown;
  files?: unknown;
  license?: unknown;
  publishConfig?: { access?: unknown; registry?: unknown };
  exports?: unknown;
  scripts?: Record<string, string>;
  shenron?: { runtime?: Record<string, unknown> };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** JSONC → JSON: drops comments and trailing commas outside strings. */
function parseJsonc<T>(text: string): T | null {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    out += c;
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")) as T;
  } catch {
    return null;
  }
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

const WALK_PRUNE = new Set([
  "node_modules",
  ".next",
  ".next-build",
  ".next-dev",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "fixtures",
  ".git",
  "data",
  "assets",
  "public",
  "storage",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (WALK_PRUNE.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:m|c)?tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** Non-type import specifiers of a file, from blanked code (offsets preserved). */
function importSpecifiers(source: string): { specifier: string; index: number }[] {
  const code = stripNonCode(source);
  const out: { specifier: string; index: number }[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?!type\s)(?:[\w$*{}\s,]+?)\s*\bfrom\s*(["'])/g,
    /\bimport\s*(["'])/g,
    /\bimport\s*\(\s*(["'])/g,
    /\brequire\s*\(\s*(["'])/g,
  ];
  for (const re of patterns) {
    for (const match of code.matchAll(re)) {
      const quoteIndex = (match.index ?? 0) + match[0].length - 1;
      const quote = source[quoteIndex];
      if (quote !== '"' && quote !== "'") continue;
      const end = source.indexOf(quote, quoteIndex + 1);
      if (end === -1) continue;
      out.push({ specifier: source.slice(quoteIndex + 1, end), index: match.index ?? 0 });
    }
  }
  return out;
}

function shenronPackageOf(specifier: string): string | null {
  if (!specifier.startsWith("@aphrody/shenron-")) return null;
  const [scope, name] = specifier.split("/");
  return `${scope}/${name}`;
}

const violations: Violation[] = [];
function report(scope: string, check: string, detail: string, severity: Severity = "error"): void {
  violations.push({ id: `${scope} | ${check} | ${detail}`, scope, check, detail, severity });
}
function reportOffences(scope: string, check: string, offences: Offence[]): void {
  for (const offence of offences)
    report(scope, check, `${offence.file}: ${offence.rule}: ${offence.excerpt}`);
}

// ── Package checks ───────────────────────────────────────────────────────────

function exportMap(manifest: Manifest): Record<string, unknown> {
  const field = manifest.exports;
  if (typeof field === "string") return { ".": field };
  if (field && typeof field === "object") return field as Record<string, unknown>;
  return {};
}

function exportTargets(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object")
    return Object.values(value as Record<string, unknown>).flatMap(exportTargets);
  return [];
}

/** Files a `*` export target can reach; like Node, `*` spans nested directories. */
function wildcardMatches(packageDir: string, target: string): number {
  const [prefix = "", suffix = ""] = target.replace(/^\.\//, "").split("*");
  const base = join(packageDir, prefix);
  const dir = prefix.endsWith("/") ? base : dirname(base);
  if (!existsSync(dir)) return 0;
  let count = 0;
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const rel = toPosix(relative(packageDir, full));
        if (rel.startsWith(prefix) && rel.endsWith(suffix)) count++;
      }
    }
  };
  walk(dir);
  return count;
}

async function checkPackage(name: string, relDir: string): Promise<void> {
  const dir = join(ROOT, relDir);
  const manifest = readJson<Manifest>(join(dir, "package.json"));
  if (!manifest) {
    report(name, "manifest", "package.json missing or unreadable");
    return;
  }

  // 1. exports targets exist, each entry has a class.
  const runtime = manifest.shenron?.runtime ?? {};
  for (const [key, value] of Object.entries(exportMap(manifest))) {
    for (const target of exportTargets(value)) {
      if (target.includes("*")) {
        if (wildcardMatches(dir, target) === 0)
          report(name, "exports", `${key} → ${target} matches no file`);
      } else if (!existsSync(join(dir, target))) {
        report(name, "exports", `${key} → ${target} does not exist`);
      }
    }
    const declared = runtime[key];
    const known = [...RUNTIME_CLASSES, ...ASSET_CLASSES] as readonly string[];
    if (typeof declared !== "string" || !known.includes(declared)) {
      report(name, "runtime-class", `${key} has no shenron.runtime class`);
    }
  }

  // 2. scripts, private, no build output. 3. tsconfig.
  checkManifest(name, dir, manifest);
  checkTsconfig(name, dir);

  // 4. dependency edges (manifest) and import edges (code).
  checkEdges(name, dir, manifest);

  // 5. runtime classes, escapes, empty-env imports, browser purity.
  // Manifest-level offences of the walker duplicate check 1 above.
  const manifestRules = new Set(["missing-runtime-class", "missing-export-target"]);
  reportOffences(
    name,
    "runtime",
    (await checkPackageRuntimes(dir)).filter(
      (offence) =>
        !manifestRules.has(offence.rule) && !(name === FFI_OWNER && FFI_RULES.has(offence.rule)),
    ),
  );
  reportOffences(name, "escape", await checkNoEscapingImports(dir));
  reportOffences(name, "empty-env", await checkEmptyEnvImports(dir));
  reportOffences(name, "browser", await checkBrowserBundles(dir));
}

function checkManifest(name: string, dir: string, manifest: Manifest): void {
  for (const script of ["typecheck", "lint", "test"]) {
    if (!manifest.scripts?.[script]) report(name, "scripts", `missing script "${script}"`);
  }
  for (const issue of publicationViolations(manifest, toPosix(relative(ROOT, dir))))
    report(name, "manifest", issue);
  for (const issue of publicFileViolations(dir, PUBLIC_LIBRARY_FILES[name] ?? []))
    report(name, "public-files", issue);
  for (const field of ["main", "module"] as const) {
    if (manifest[field] !== undefined) report(name, "manifest", `field "${field}" is set`);
  }
  if (
    Object.values(exportMap(manifest))
      .flatMap(exportTargets)
      .some((t) => /(^|\/)dist\//.test(t))
  ) {
    report(name, "manifest", "exports point to dist/");
  }
  if (existsSync(join(dir, "dist"))) report(name, "manifest", "dist/ directory exists");
  const usesTsup =
    Object.values(manifest.scripts ?? {}).some((script) => /\btsup\b/.test(script)) ||
    Boolean(manifest.devDependencies?.tsup || manifest.dependencies?.tsup) ||
    existsSync(join(dir, "tsup.config.ts"));
  if (usesTsup) report(name, "manifest", "tsup is used");
}

function checkTsconfig(name: string, dir: string): void {
  const tsconfigFile = join(dir, "tsconfig.json");
  const tsconfig = existsSync(tsconfigFile)
    ? parseJsonc<{ extends?: string; compilerOptions?: Record<string, unknown> }>(
        readFileSync(tsconfigFile, "utf8"),
      )
    : null;
  if (!tsconfig) {
    report(name, "tsconfig", "tsconfig.json missing or unreadable");
  } else {
    const expected =
      name === "@aphrody/shenron-config"
        ? /^\.\/tsconfig\/[\w-]+\.json$/
        : /^\.\.\/config\/tsconfig\/[\w-]+\.json$/;
    if (typeof tsconfig.extends !== "string" || !expected.test(tsconfig.extends)) {
      report(name, "tsconfig", "does not extend ../config/tsconfig/*.json");
    }
    const options = tsconfig.compilerOptions ?? {};
    for (const forbiddenOption of ["baseUrl", "paths", "ignoreDeprecations"]) {
      if (forbiddenOption in options) report(name, "tsconfig", `sets ${forbiddenOption}`);
    }
    const resolution = options.moduleResolution;
    if (typeof resolution === "string" && /^(node|node10|classic)$/i.test(resolution)) {
      report(name, "tsconfig", `moduleResolution ${resolution}`);
    }
  }
}

function checkEdges(name: string, dir: string, manifest: Manifest): void {
  const allowed = ALLOWED_EDGES[name] ?? { runtime: [], dev: [] };
  for (const [group, deps] of [
    ["dependencies", manifest.dependencies],
    ["peerDependencies", manifest.peerDependencies],
    ["devDependencies", manifest.devDependencies],
  ] as const) {
    for (const dep of Object.keys(deps ?? {})) {
      if (!dep.startsWith("@aphrody/shenron-")) continue;
      const ok =
        allowed.runtime.includes(dep) || (group === "devDependencies" && allowed.dev.includes(dep));
      if (!ok) report(name, "edges", `${group} → ${dep} is not allowed (§4.1)`);
    }
  }
  for (const file of sourceFiles(dir)) {
    const rel = toPosix(relative(ROOT, file));
    const isTest = /(^|\/)test\/|\.test\.tsx?$/.test(rel);
    for (const { specifier } of importSpecifiers(readFileSync(file, "utf8"))) {
      const target = shenronPackageOf(specifier);
      if (!target || target === name) continue;
      const ok = allowed.runtime.includes(target) || (isTest && allowed.dev.includes(target));
      if (!ok) {
        report(name, "edges", `${rel} imports ${specifier} (§4.1)`);
        continue;
      }
      const subpaths = EDGE_SUBPATHS[name]?.[target];
      if (subpaths && !subpaths.includes(specifier))
        report(
          name,
          "edges",
          `${rel} imports ${specifier}; only ${subpaths.join(", ")} is allowed`,
        );
    }
  }
}

/** Cycles over every @aphrody/shenron-* manifest edge (dependencies + dev + peer). */
function checkCycles(): void {
  const graph = new Map<string, string[]>();
  for (const [name, relDir] of Object.entries(PACKAGES)) {
    const manifest = readJson<Manifest>(join(ROOT, relDir, "package.json"));
    const deps = new Set<string>();
    for (const group of [
      manifest?.dependencies,
      manifest?.devDependencies,
      manifest?.peerDependencies,
    ]) {
      for (const dep of Object.keys(group ?? {})) if (PACKAGES[dep] && dep !== name) deps.add(dep);
    }
    graph.set(name, [...deps].toSorted());
  }
  const state = new Map<string, "visiting" | "done">();
  const seen = new Set<string>();
  const visit = (node: string, path: string[]) => {
    if (state.get(node) === "done") return;
    if (state.get(node) === "visiting") {
      const cycle = [...path.slice(path.indexOf(node)), node].join(" → ");
      if (!seen.has(cycle)) {
        seen.add(cycle);
        report("graph", "cycle", cycle);
      }
      return;
    }
    state.set(node, "visiting");
    for (const next of graph.get(node) ?? []) visit(next, [...path, node]);
    state.set(node, "done");
  };
  for (const node of [...graph.keys()].toSorted()) visit(node, []);
}

/**
 * Aphrody capabilities are consumed as registry packages or reviewed immutable npm archives, pinned exactly
 * (bunfig.toml), directly or through the root `workspaces.catalog`; no manifest links an external Aphrody checkout or a path outside the repo.
 */
function checkDependencyDirection(): void {
  const root = readJson<{
    workspaces?: { packages?: string[]; catalog?: Record<string, string> };
    "shenron.packageArchives"?: Record<string, AphrodyArchivePin>;
  }>(join(ROOT, "package.json"));
  const catalog = root?.workspaces?.catalog ?? {};
  const archives = root?.["shenron.packageArchives"] ?? {};
  const lock = Bun.JSONC.parse(readFileSync(join(ROOT, "bun.lock"), "utf8")) as {
    packages?: Record<string, unknown[]>;
  };
  for (const [name, pin] of Object.entries(archives)) {
    const entry = lock.packages?.[name];
    if (
      catalog[name] !== pin.url ||
      entry?.[0] !== `${name}@${pin.url}` ||
      entry?.at(-1) !== pin.integrity
    )
      report(
        "workspace",
        "direction",
        `${name} archive catalog, lock URL or SHA-512 integrity disagrees with the reviewed pin`,
      );
  }
  for (const workspace of root?.workspaces?.packages ?? []) {
    if (workspace.startsWith("../"))
      report("workspace", "direction", `workspace glob ${workspace} leaves the repository`);
  }
  const directories = [
    ROOT,
    ...["apps", "packages"].flatMap((kind) =>
      readdirSync(join(ROOT, kind), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(ROOT, kind, entry.name)),
    ),
  ];
  const localIdentities = new Set(
    directories.flatMap((dir) => {
      const manifest = readJson<Manifest>(join(dir, "package.json"));
      return manifest?.name ? [manifest.name] : [];
    }),
  );
  for (const dir of directories) {
    const manifest = readJson<Manifest>(join(dir, "package.json"));
    const where = toPosix(relative(ROOT, dir)) || ".";
    // Package checks already inspect their reviewed public roots; this also covers
    // the other approved libraries and every private application/root workspace.
    if (!manifest) continue;
    if (!PACKAGES[manifest.name ?? ""]) {
      for (const issue of publicationViolations(manifest, where)) report(where, "manifest", issue);
      for (const issue of publicFileViolations(
        dir,
        PUBLIC_LIBRARY_FILES[manifest.name ?? ""] ?? [],
      ))
        report(where, "public-files", issue);
    }
    for (const group of [
      manifest?.dependencies,
      manifest?.devDependencies,
      manifest?.peerDependencies,
    ]) {
      for (const [name, version] of Object.entries(group ?? {})) {
        const path = /^(?:file|link|portal):(.*)$/.exec(version)?.[1];
        if (path !== undefined && relative(ROOT, resolve(dir, path)).startsWith(".."))
          report(
            "workspace",
            "direction",
            `${where} links ${name} outside the repository (${version})`,
          );
        const pinned = version === "catalog:" ? (catalog[name] ?? version) : version;
        if (
          name.startsWith("@aphrody/") &&
          !pinnedAphrodyDependency(name, pinned, localIdentities, archives)
        )
          report(
            "workspace",
            "direction",
            `${where} depends on ${name}@${pinned}, not an exact pin`,
          );
      }
    }
  }
}

// ── Application boundaries (§4.2) ────────────────────────────────────────────

function checkApps(): void {
  // apps/bot: no bun:ffi, @aphrody/bun, drawM3Scene*.
  for (const file of sourceFiles(join(ROOT, "apps", "bot"))) {
    const source = readFileSync(file, "utf8");
    const rel = toPosix(relative(ROOT, file));
    for (const { specifier } of importSpecifiers(source)) {
      if (specifier === "bun:ffi") report("apps/bot", "boundary", `${rel} imports bun:ffi`);
      if (specifier === "@aphrody/bun" || specifier.startsWith("@aphrody/bun/")) {
        report("apps/bot", "boundary", `${rel} imports ${specifier}`);
      }
    }
    if (/\bdrawM3Scene\w*/.test(stripNonCode(source)))
      report("apps/bot", "boundary", `${rel} uses drawM3Scene`);
  }

  // No package imports apps/ (covered per package by the escape check); site
  // "use client" reach and bun-class subpaths.
  const runtimeOf = (specifier: string): string | null => {
    const pkg = shenronPackageOf(specifier);
    if (!pkg || !PACKAGES[pkg]) return null;
    const manifest = readJson<Manifest>(join(ROOT, PACKAGES[pkg] as string, "package.json"));
    const sub = specifier === pkg ? "." : `./${specifier.slice(pkg.length + 1)}`;
    const declared = manifest?.shenron?.runtime?.[sub];
    return typeof declared === "string" ? declared : null;
  };
  for (const file of sourceFiles(join(ROOT, "apps", "site", "src"))) {
    const source = readFileSync(file, "utf8");
    const rel = toPosix(relative(ROOT, file));
    const isClient = /^\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*["']use client["']/.test(source);
    const isServerOnly = /^\s*import\s+["']server-only["']/m.test(source);
    for (const { specifier } of importSpecifiers(source)) {
      if (!specifier.startsWith("@aphrody/shenron-")) continue;
      // A `server-only` module runs inside the Bun-hosted site (Jev, RAG chat, canon judgment).
      if (runtimeOf(specifier) === "bun" && !isServerOnly)
        report("apps/site", "boundary", `${rel} imports bun-class ${specifier}`);
      if (
        isClient &&
        !CLIENT_ALLOWED_PURE.has(specifier) &&
        CLIENT_FORBIDDEN.some(
          (forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}/`),
        )
      ) {
        report("apps/site", "client-reach", `${rel} ("use client") imports ${specifier}`);
      }
    }
  }

  // transpilePackages covers every first-rank @aphrody/shenron-* dependency of the site.
  // withBun (@aphrody/next-bun) detects workspace packages publishing TypeScript sources automatically.
  const site = readJson<Manifest>(join(ROOT, "apps", "site", "package.json"));
  const nextConfigFile = join(ROOT, "apps", "site", "next.config.ts");
  const nextConfig = existsSync(nextConfigFile) ? readFileSync(nextConfigFile, "utf8") : "";
  if (!/\bwithBun\s*\(/.test(nextConfig)) {
    const listMatch = /transpilePackages\s*:\s*\[([^\]]*)\]/.exec(nextConfig);
    const transpiled = new Set(
      [...(listMatch?.[1] ?? "").matchAll(/["']([^"']+)["']/g)].map((m) => m[1]),
    );
    for (const dep of Object.keys(site?.dependencies ?? {})) {
      if (PACKAGES[dep] && !transpiled.has(dep)) {
        report("apps/site", "transpile", `${dep} missing from transpilePackages`);
      }
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────

const selected = ONLY ? { [ONLY]: PACKAGES[ONLY] as string } : PACKAGES;
for (const [name, relDir] of Object.entries(selected)) await checkPackage(name, relDir);
if (!ONLY) {
  checkCycles();
  checkApps();
  checkDependencyDirection();
}

const baseline: Baseline = readJson<Baseline>(BASELINE_FILE) ?? { transitional: [], phase2: [] };
baseline.transitional ??= [];
baseline.phase2 ??= [];
const inScope = (id: string) => !ONLY || id.startsWith(`${ONLY} | `);

const errors = violations.filter((v) => v.severity === "error");
const warnings = violations.filter((v) => v.severity === "warn");

if (WRITE_BASELINE) {
  const current = new Set(errors.map((v) => v.id));
  const phase2 = baseline.phase2.filter((entry) => current.has(entry.id) || !inScope(entry.id));
  const phase2Ids = new Set(phase2.map((entry) => entry.id));
  const previous = new Map(baseline.transitional.map((entry) => [entry.id, entry]));
  const transitional = [
    ...baseline.transitional.filter((entry) => !inScope(entry.id)),
    ...errors
      .filter((v) => !phase2Ids.has(v.id))
      .map(
        (v) =>
          previous.get(v.id) ?? {
            id: v.id,
            reason: "pre-existing at wave 1; fixed by the owning workstream before wave 5",
          },
      ),
  ].toSorted((a, b) => a.id.localeCompare(b.id));
  const next: Baseline = {
    $comment:
      baseline.$comment ??
      "Pre-existing check:packages violations. `transitional` must be empty at the end of Phase 1 (--strict); `phase2` entries cite a docs/architecture/STACK.md §7.3 ticket. The baseline may only shrink after wave 1.",
    transitional,
    phase2: phase2.toSorted((a, b) => a.id.localeCompare(b.id)),
  };
  // Two-space indent: the layout oxfmt keeps (format:check covers scripts/).
  await Bun.write(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `baseline written: ${transitional.length} transitional, ${next.phase2.length} phase2`,
  );
  process.exit(0);
}

const known = new Set([...baseline.transitional, ...baseline.phase2].map((entry) => entry.id));
const fresh = errors.filter((v) => !known.has(v.id));
const currentIds = new Set(errors.map((v) => v.id));
const stale = [...baseline.transitional, ...baseline.phase2].filter(
  (entry) => inScope(entry.id) && !currentIds.has(entry.id),
);
const transitionalInScope = baseline.transitional.filter(
  (entry) => inScope(entry.id) && currentIds.has(entry.id),
);
const phase2InScope = baseline.phase2.filter(
  (entry) => inScope(entry.id) && currentIds.has(entry.id),
);

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { fresh, warnings, stale, transitional: transitionalInScope, phase2: phase2InScope },
      null,
      2,
    ),
  );
} else {
  const scopeLabel = ONLY ?? "all packages and apps";
  console.log(`check:packages — ${scopeLabel}`);
  for (const v of fresh) console.log(`  \x1b[31merror\x1b[0m  ${v.id}`);
  for (const v of warnings) console.log(`  \x1b[33mwarn\x1b[0m   ${v.id}`);
  // Ticketed violations stay on screen: phase2 tolerates them, it does not hide them.
  for (const entry of phase2InScope)
    console.log(`  \x1b[36mphase2\x1b[0m ${entry.id} (${entry.ticket ?? "no ticket"})`);
  for (const entry of stale) console.log(`  \x1b[33mstale baseline entry\x1b[0m  ${entry.id}`);
  if (STRICT)
    for (const entry of transitionalInScope)
      console.log(`  \x1b[31mtransitional\x1b[0m  ${entry.id}`);
  console.log(
    `errors: ${fresh.length} new, ${transitionalInScope.length} transitional, ${phase2InScope.length} phase2 | warnings: ${warnings.length} | stale: ${stale.length}`,
  );
}

const failed = fresh.length > 0 || (STRICT && transitionalInScope.length > 0);
process.exit(failed ? 1 : 0);
