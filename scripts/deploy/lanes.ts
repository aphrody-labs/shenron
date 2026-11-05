#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Change detection of the Shenron release: which lanes a revision really changes.
 *
 *   bun scripts/deploy/lanes.ts keys [--rev <rev>] [--extra name=value]... [--format json|shell]
 *   bun scripts/deploy/lanes.ts plan --base <rev> [--head <rev>] [--extra name=value]... [--format json|shell|text]
 *   bun scripts/deploy/lanes.ts history [--count N] [--rev <rev>]      dry run over recent commits
 *   bun scripts/deploy/lanes.ts --check [--rev <rev>]                  every tracked path is classified
 *
 * A lane key is the SHA-256 of the Git listing (mode, object id, path) of its inputs minus their
 * tests (classification.ignoreInKeys), its toolchain pin, its upstream lane keys and its extras,
 * read from the repository at one revision. The working tree is never
 * consulted, so a key is reproducible on any clone and identical for identical inputs: reverting a
 * commit restores the old key, and with it the old artifact. Workspace inputs come from the
 * workspace:* closure of the manifests at that revision, so a package nothing deployed depends on
 * changes no key. A path is an object id whether it is a tree, a blob or a submodule gitlink, so
 * vendoring a submodule needs no change here. Only Git and Bun are required: this runs before
 * `bun install`.
 *
 * `plan` compares the keys of two revisions; pass the active release as --base, never the parent
 * commit, so that commits skipped by [skip ci] or a cancelled run are still deployed.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "../..");
const SCHEMA = "shenron-lanes/v2";

export type Lane = {
  toolchain: "rust" | "bun" | "none";
  workspace?: string;
  inputs: string[];
  outputs: string[];
  services: string[];
  after?: string[];
  extras?: string[];
};
export type Environment = {
  toolchain: { rust: string; bun: string };
  lanes: Record<string, Lane>;
  classification: {
    noDeploy: string[];
    holds: Record<string, string[] | string>;
    infraNotices: string[];
    ignoreInKeys?: string[];
  };
};
export type Plan = {
  base: string;
  head: string;
  changedFiles: number;
  lanes: Record<string, { key: string; changed: boolean }>;
  rebuild: string[];
  services: string[];
  deploy: boolean;
  holds: Record<string, string[]>;
  infraNotices: string[];
  unclassified: string[];
};

export function loadEnvironment(root = ROOT): Environment {
  return JSON.parse(readFileSync(join(root, "deploy/environment.json"), "utf8"));
}

/** Run git and return its stdout; `null` when it fails and `optional` is set. */
export function git(root: string, args: string[], optional?: false): string;
export function git(root: string, args: string[], optional: true): string | null;
export function git(root: string, args: string[], optional = false): string | null {
  const run = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (run.exitCode === 0) return run.stdout.toString();
  if (optional) return null;
  throw new Error(`git ${args.join(" ")}: ${run.stderr.toString().trim()}`);
}

/**
 * Git object ids of paths at a revision, in one process: tree, blob or submodule gitlink alike.
 * Each path is resolved on its own (`<rev>:<path>`): `git ls-tree` given both `crates` and
 * `crates/x` descends into `crates` and never reports `crates` itself, which silently dropped a
 * whole input from a key.
 */
export function objectIds(root: string, rev: string, paths: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  if (paths.length === 0) return ids;
  const run = Bun.spawnSync(["git", "-C", root, "cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    stdin: Buffer.from(paths.map((path) => `${rev}:${path}\n`).join("")),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (run.exitCode !== 0) throw new Error(`git cat-file: ${run.stderr.toString().trim()}`);
  const lines = run.stdout.toString().split("\n");
  paths.forEach((path, index) => {
    const line = lines[index] ?? "";
    // `<rev>:<path> missing` for an absent path; `<oid> submodule` for a gitlink.
    if (line.endsWith(" missing")) return;
    const id = line.split(" ")[0]!;
    if (/^[0-9a-f]{40,64}$/.test(id)) ids.set(path, id);
  });
  return ids;
}

/** `**` any depth, `*` within one path segment; matched against the whole path. */
export function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === "*" && pattern[index + 1] === "*") {
      // `**/` matches zero or more whole segments.
      source += pattern[index + 2] === "/" ? "(?:.*/)?" : ".*";
      index += pattern[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else source += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/**
 * Digest of each input path at a revision, from one recursive listing: the sorted
 * `<mode> <id> <path>` records under it, minus the files matched by `ignore` (tests: they never
 * reach an artifact). A path without any record is absent from the map.
 */
export function inputDigests(root: string, rev: string, paths: string[], ignore: string[]): Map<string, string> {
  const digests = new Map<string, string>();
  if (paths.length === 0) return digests;
  const ignored = ignore.map(globToRegExp);
  const records: { path: string; line: string }[] = [];
  const output = git(root, ["ls-tree", "-r", "-z", "--full-tree", rev, "--", ...paths]);
  for (const record of output.split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    const path = record.slice(tab + 1);
    if (ignored.some((pattern) => pattern.test(path))) continue;
    const [mode, , id] = record.slice(0, tab).split(" ");
    records.push({ path, line: `${mode} ${id} ${path}` });
  }
  records.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const input of paths) {
    const lines = records.filter((record) => record.path === input || record.path.startsWith(`${input}/`));
    if (lines.length > 0) digests.set(input, sha256(lines.map((record) => record.line).join("\n")));
  }
  return digests;
}

/** Contents of blobs at a revision, in one process; a missing blob is absent from the map. */
function blobs(root: string, rev: string, paths: string[]): Map<string, string> {
  const run = Bun.spawnSync(["git", "-C", root, "cat-file", "--batch"], {
    stdin: Buffer.from(paths.map((path) => `${rev}:${path}\n`).join("")),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (run.exitCode !== 0) throw new Error(`git cat-file: ${run.stderr.toString().trim()}`);
  const data = Buffer.from(run.stdout);
  const found = new Map<string, string>();
  let offset = 0;
  for (const path of paths) {
    const newline = data.indexOf(10, offset);
    const header = data.toString("utf8", offset, newline);
    offset = newline + 1;
    if (header.endsWith(" missing")) continue;
    const size = Number(header.split(" ")[2]);
    found.set(path, data.toString("utf8", offset, offset + size));
    offset += size + 1;
  }
  return found;
}

type Workspaces = { closure(start: string): string[] };
const workspaceCache = new Map<string, Workspaces>();

/** Workspace graph of a revision, read once from its manifests. */
function workspaces(root: string, rev: string): Workspaces {
  const cacheKey = `${root}\0${rev}`;
  const cached = workspaceCache.get(cacheKey);
  if (cached) return cached;
  const directories = git(root, ["ls-tree", "--name-only", rev, "apps/", "packages/"])
    .split("\n")
    .filter(Boolean);
  const contents = blobs(root, rev, directories.map((directory) => `${directory}/package.json`));
  const manifests = new Map<string, { directory: string; dependencies: string[] }>();
  const byDirectory = new Map<string, string[]>();
  for (const directory of directories) {
    const text = contents.get(`${directory}/package.json`);
    // A submodule has no blob in this tree: it stays an input through its gitlink.
    if (text === undefined) continue;
    const manifest = JSON.parse(text);
    const dependencies = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    });
    manifests.set(manifest.name, { directory, dependencies });
    byDirectory.set(directory, dependencies);
  }
  const graph: Workspaces = {
    closure(start) {
      const reached = new Set<string>([start]);
      const pending = [...(byDirectory.get(start) ?? [])];
      while (pending.length > 0) {
        const entry = manifests.get(pending.pop()!);
        if (!entry || reached.has(entry.directory)) continue;
        reached.add(entry.directory);
        pending.push(...entry.dependencies);
      }
      // Entries without a readable manifest are submodules every package may import.
      for (const directory of directories) if (!byDirectory.has(directory)) reached.add(directory);
      return [...reached].sort();
    },
  };
  workspaceCache.set(cacheKey, graph);
  return graph;
}

/**
 * An input ending in `?` may be absent (vendor/ goes away when the vendored trees move to npm):
 * absent, it still counts in the key as `absent`.
 */
export const bare = (input: string) => (input.endsWith("?") ? input.slice(0, -1) : input);

/** Directories of the workspaces a manifest depends on, transitively, itself included. */
export function workspaceClosure(root: string, rev: string, start: string): string[] {
  return workspaces(root, rev).closure(start);
}

/** Input paths of a lane at a revision: its declared inputs plus its workspace closure. */
export function laneInputs(root: string, rev: string, lane: Lane): string[] {
  const closure = lane.workspace ? workspaceClosure(root, rev, lane.workspace) : [];
  return [...new Set([...lane.inputs.map(bare), ...closure])].sort();
}

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

/** Lanes in dependency order: a lane comes after the lanes named by its `after`. */
export function orderedLanes(environment: Environment): string[] {
  const ordered: string[] = [];
  const visit = (name: string, trail: string[]) => {
    if (ordered.includes(name)) return;
    if (trail.includes(name)) throw new Error(`lane cycle: ${[...trail, name].join(" > ")}`);
    const lane = environment.lanes[name];
    if (!lane) throw new Error(`unknown lane ${name}`);
    for (const upstream of lane.after ?? []) visit(upstream, [...trail, name]);
    ordered.push(name);
  };
  for (const name of Object.keys(environment.lanes)) visit(name, []);
  return ordered;
}

export function laneKeys(
  root: string,
  rev: string,
  extras: Record<string, string> = {},
  environment = loadEnvironment(root),
): Record<string, string> {
  const keys: Record<string, string> = {};
  const names = orderedLanes(environment);
  const inputs = new Map(names.map((name) => [name, laneInputs(root, rev, environment.lanes[name]!)]));
  const ids = inputDigests(
    root,
    rev,
    [...new Set([...inputs.values()].flat())],
    environment.classification.ignoreInKeys ?? [],
  );
  for (const name of names) {
    const lane = environment.lanes[name]!;
    const toolchain = lane.toolchain === "none" ? "" : environment.toolchain[lane.toolchain];
    keys[name] = sha256(
      JSON.stringify({
        schema: SCHEMA,
        lane: name,
        toolchain: `${lane.toolchain}:${toolchain}`,
        inputs: inputs.get(name)!.map((path) => `${path} ${ids.get(path) ?? "absent"}`),
        after: (lane.after ?? []).map((upstream) => `${upstream} ${keys[upstream]}`),
        extras: (lane.extras ?? []).map((extra) => `${extra} ${extras[extra] ?? "unset"}`),
      }),
    );
  }
  return keys;
}

const covers = (pattern: string, path: string) => path === pattern || path.startsWith(`${pattern}/`);

export function changedFiles(root: string, base: string, head: string): string[] {
  return git(root, ["diff", "--name-only", "--no-renames", base, head]).split("\n").filter(Boolean);
}

export function plan(
  root: string,
  base: string,
  head: string,
  extras: Record<string, string> = {},
  environment = loadEnvironment(root),
): Plan {
  const baseSha = git(root, ["rev-parse", "--verify", `${base}^{commit}`]).trim();
  const headSha = git(root, ["rev-parse", "--verify", `${head}^{commit}`]).trim();
  const files = changedFiles(root, baseSha, headSha);
  const before = laneKeys(root, baseSha, extras, environment);
  const after = laneKeys(root, headSha, extras, environment);
  const lanes: Plan["lanes"] = {};
  for (const [name, key] of Object.entries(after))
    lanes[name] = { key, changed: key !== before[name] };
  const rebuild = Object.keys(lanes).filter((name) => lanes[name]!.changed);
  const { noDeploy, holds, infraNotices } = environment.classification;
  const services = [
    ...new Set(rebuild.filter((name) => name !== "image").flatMap((name) => environment.lanes[name]!.services)),
  ].sort();
  // The image alone changing (its Dockerfile) still restarts every service it carries.
  if (services.length === 0 && lanes.image?.changed) services.push(...environment.lanes.image!.services);
  const held: Plan["holds"] = {};
  for (const [hold, patterns] of Object.entries(holds)) {
    if (!Array.isArray(patterns)) continue;
    const matched = files.filter((file) => patterns.some((pattern) => covers(pattern, file)));
    if (matched.length > 0) held[hold] = matched;
  }
  const inputs = Object.values(environment.lanes).flatMap((lane) => lane.inputs.map(bare));
  const workspaces = ["apps", "packages"];
  const unclassified = files.filter(
    (file) =>
      !noDeploy.some((pattern) => covers(pattern, file)) &&
      !inputs.some((pattern) => covers(pattern, file)) &&
      !workspaces.some((pattern) => covers(pattern, file)),
  );
  return {
    base: baseSha,
    head: headSha,
    changedFiles: files.length,
    lanes,
    rebuild,
    services,
    deploy: rebuild.length > 0,
    holds: held,
    infraNotices: files.filter((file) => infraNotices.some((pattern) => covers(pattern, file))),
    unclassified,
  };
}

/** Tracked top-level entries that are neither a lane input nor declared as not deployed. */
export function classificationProblems(
  root: string,
  rev: string,
  environment = loadEnvironment(root),
): string[] {
  const known = new Set(
    [
      ...environment.classification.noDeploy,
      ...Object.values(environment.lanes).flatMap((lane) => lane.inputs.map(bare)),
      "apps",
      "packages",
    ].map((path) => path.split("/")[0]!),
  );
  const problems = git(root, ["ls-tree", "--name-only", rev])
    .split("\n")
    .filter(Boolean)
    .filter((entry) => !known.has(entry))
    .map((entry) => `unclassified top-level path: ${entry}`);
  const declared = [...new Set(Object.values(environment.lanes).flatMap((lane) => lane.inputs.map(bare)))];
  const present = objectIds(root, rev, declared);
  for (const [name, lane] of Object.entries(environment.lanes))
    for (const input of lane.inputs)
      if (!input.endsWith("?") && !present.has(input)) problems.push(`lane ${name}: input ${input} is absent at ${rev}`);
  return problems;
}

/** One line per recent commit: what a deploy of it alone would have rebuilt. */
export function history(root: string, rev: string, count: number, environment = loadEnvironment(root)) {
  const commits = git(root, ["rev-list", "--first-parent", `--max-count=${count}`, rev])
    .split("\n")
    .filter(Boolean);
  return commits.flatMap((commit) => {
    if (git(root, ["rev-parse", "--verify", "-q", `${commit}^`], true) === null) return [];
    const result = plan(root, `${commit}^`, commit, {}, environment);
    const subject = git(root, ["show", "-s", "--format=%s", commit]).trim();
    return [{ commit: commit.slice(0, 8), subject, ...result }];
  });
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function planToShell(result: Plan): string {
  const lines = [
    `PLAN_BASE=${result.base}`,
    `PLAN_HEAD=${result.head}`,
    `PLAN_DEPLOY=${result.deploy ? 1 : 0}`,
    `PLAN_REBUILD=${shellQuote(result.rebuild.join(" "))}`,
    `PLAN_SERVICES=${shellQuote(result.services.join(" "))}`,
    `PLAN_HOLDS=${shellQuote(Object.keys(result.holds).join(" "))}`,
  ];
  for (const [name, lane] of Object.entries(result.lanes))
    lines.push(`LANE_KEY_${name.toUpperCase()}=${lane.key}`);
  return `${lines.join("\n")}\n`;
}

function main(argv: string[]) {
  const command = argv[0]?.startsWith("--") ? "" : argv.shift();
  const option = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const extras: Record<string, string> = {};
  argv.forEach((value, index) => {
    if (value !== "--extra") return;
    const [name, ...rest] = argv[index + 1]!.split("=");
    extras[name!] = rest.join("=");
  });
  const rev = option("--rev") ?? "HEAD";
  const format = option("--format") ?? "json";
  if (argv.includes("--check")) {
    const problems = classificationProblems(ROOT, rev);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log("lanes: every tracked path is classified");
    return;
  }
  if (command === "keys") {
    const keys = laneKeys(ROOT, rev, extras);
    if (format === "shell")
      for (const [name, key] of Object.entries(keys)) console.log(`LANE_KEY_${name.toUpperCase()}=${key}`);
    else console.log(JSON.stringify(keys, null, 2));
    return;
  }
  if (command === "plan") {
    const base = option("--base");
    if (!base) throw new Error("plan needs --base <rev> (the active release)");
    const result = plan(ROOT, base, option("--head") ?? "HEAD", extras);
    if (format === "shell") process.stdout.write(planToShell(result));
    else if (format === "text") console.log(describe(result));
    else console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "history") {
    const entries = history(ROOT, rev, Number(option("--count") ?? 30));
    for (const entry of entries) {
      const lanes = entry.rebuild.join(",") || "-";
      const holds = Object.keys(entry.holds).join(",");
      console.log(
        `${entry.commit} ${String(entry.changedFiles).padStart(4)} files  ${lanes.padEnd(24)} ` +
          `${(entry.services.join(",") || "no deploy").padEnd(10)}${holds ? ` HOLD:${holds}` : ""}  ${entry.subject.slice(0, 56)}`,
      );
    }
    const deploys = entries.filter((entry) => entry.deploy).length;
    console.log(`${deploys}/${entries.length} commits change a deployed artifact`);
    return;
  }
  console.error("usage: lanes.ts keys|plan|history|--check (see the header of this file)");
  process.exit(64);
}

export function describe(result: Plan): string {
  return [
    `base ${result.base.slice(0, 12)} -> head ${result.head.slice(0, 12)}, ${result.changedFiles} files`,
    `rebuild: ${result.rebuild.join(" ") || "nothing"}`,
    `restart: ${result.services.join(" ") || "nothing"}`,
    ...Object.entries(result.holds).map(([hold, files]) => `HOLD ${hold}: ${files.join(" ")}`),
    ...(result.infraNotices.length ? [`Infra must apply: ${result.infraNotices.join(" ")}`] : []),
    ...(result.unclassified.length ? [`UNCLASSIFIED: ${result.unclassified.join(" ")}`] : []),
  ].join("\n");
}

if (import.meta.main) main(process.argv.slice(2));
