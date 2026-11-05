#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Content-addressed store of the release lanes: one manifest per lane key, one object per file.
 *
 *   bun scripts/deploy/artifacts.ts has   <lane> <key>
 *   bun scripts/deploy/artifacts.ts put   <lane> <key> <path>...    (paths relative to --root)
 *   bun scripts/deploy/artifacts.ts get   <lane> <key>              restores into --root
 *   bun scripts/deploy/artifacts.ts prune [--keep N]                newest N manifests per lane
 *
 * Options: --store DIR (default $SHENRON_ARTIFACT_STORE, then the `artifacts` cache of
 * deploy/environment.json), --root DIR (default the current directory).
 *
 * Layout: objects/<aa>/<sha256> and manifests/<lane>/<key>.json. A manifest lists every file with
 * its digest, size and mode, and every symlink with its target, so two keys sharing a file store it
 * once and a Next tree that barely changed costs almost nothing. `get` re-hashes each object and
 * refuses a corrupt store rather than restore it; it copies, never links, because build tools
 * rewrite their outputs in place. Writes go through a temporary name then rename, so a crash leaves
 * no partial object and a manifest only appears once all its objects exist.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

type FileEntry = { path: string; sha256: string; size: number; mode: number };
type LinkEntry = { path: string; target: string };
export type Manifest = {
  schema: "shenron-artifact/v1";
  lane: string;
  key: string;
  createdAt: string;
  files: FileEntry[];
  links: LinkEntry[];
};

const HEX = /^[0-9a-f]{64}$/;
const NAME = /^[a-z0-9-]+$/;
// Stable mtime of restored files, so an identical artifact yields an identical image layer.
const EPOCH = new Date(0);

function assertId(lane: string, key: string) {
  if (!NAME.test(lane)) throw new Error(`invalid lane name: ${lane}`);
  if (!HEX.test(key)) throw new Error(`invalid lane key: ${key}`);
}

const objectPath = (store: string, digest: string) =>
  join(store, "objects", digest.slice(0, 2), digest);
const manifestPath = (store: string, lane: string, key: string) =>
  join(store, "manifests", lane, `${key}.json`);

async function hashFile(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

function* walk(path: string): Generator<string> {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path).toSorted()) yield* walk(join(path, entry));
}

const toPosix = (path: string) => path.split(sep).join(posix.sep);

function atomicWrite(destination: string, write: (temporary: string) => void) {
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    write(temporary);
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function has(store: string, lane: string, key: string): boolean {
  assertId(lane, key);
  return existsSync(manifestPath(store, lane, key));
}

export async function put(
  store: string,
  root: string,
  lane: string,
  key: string,
  paths: string[],
): Promise<Manifest> {
  assertId(lane, key);
  const files: FileEntry[] = [];
  const links: LinkEntry[] = [];
  for (const start of paths) {
    const absolute = resolve(root, start);
    if (!existsSync(absolute)) throw new Error(`lane ${lane}: output ${start} does not exist`);
    for (const path of walk(absolute)) {
      const name = toPosix(relative(root, path));
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        links.push({ path: name, target: readlinkSync(path) });
        continue;
      }
      if (!stat.isFile()) throw new Error(`lane ${lane}: ${name} is not a file`);
      const digest = await hashFile(path);
      const object = objectPath(store, digest);
      if (!existsSync(object)) atomicWrite(object, (temporary) => copyFileSync(path, temporary));
      files.push({ path: name, sha256: digest, size: stat.size, mode: stat.mode & 0o777 });
    }
  }
  const manifest: Manifest = {
    schema: "shenron-artifact/v1",
    lane,
    key,
    createdAt: new Date().toISOString(),
    files,
    links,
  };
  atomicWrite(manifestPath(store, lane, key), (temporary) =>
    writeFileSync(temporary, `${JSON.stringify(manifest)}\n`),
  );
  return manifest;
}

function safeDestination(root: string, name: string) {
  const destination = resolve(root, name);
  if (destination !== root && !destination.startsWith(`${resolve(root)}${sep}`))
    throw new Error(`refusing a path outside the root: ${name}`);
  return destination;
}

export async function get(
  store: string,
  root: string,
  lane: string,
  key: string,
): Promise<Manifest> {
  assertId(lane, key);
  const path = manifestPath(store, lane, key);
  if (!existsSync(path)) throw new Error(`no artifact for ${lane} ${key}`);
  const manifest: Manifest = JSON.parse(readFileSync(path, "utf8"));
  // Verify the whole artifact before touching the worktree, so a bad store leaves it intact.
  for (const entry of manifest.files) {
    const object = objectPath(store, entry.sha256);
    if (!existsSync(object)) throw new Error(`missing object for ${entry.path}`);
    if (statSync(object).size !== entry.size || (await hashFile(object)) !== entry.sha256)
      throw new Error(`corrupt object for ${entry.path}: ${entry.sha256}`);
  }
  for (const entry of manifest.files) {
    const destination = safeDestination(root, entry.path);
    atomicWrite(destination, (temporary) => {
      copyFileSync(objectPath(store, entry.sha256), temporary);
      chmodSync(temporary, entry.mode);
      utimesSync(temporary, EPOCH, EPOCH);
    });
  }
  for (const entry of manifest.links) {
    const destination = safeDestination(root, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    if (existsSync(destination) || lstatExists(destination)) unlinkSync(destination);
    symlinkSync(entry.target, destination);
  }
  return manifest;
}

function lstatExists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Keep the newest `keep` manifests of each lane, then drop objects no manifest references. */
export function prune(store: string, keep: number): { manifests: number; objects: number } {
  const root = join(store, "manifests");
  let manifests = 0;
  let objects = 0;
  const referenced = new Set<string>();
  if (!existsSync(root)) return { manifests, objects };
  for (const lane of readdirSync(root)) {
    const entries = readdirSync(join(root, lane))
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        const path = join(root, lane, name);
        return { path, manifest: JSON.parse(readFileSync(path, "utf8")) as Manifest };
      })
      .toSorted((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt));
    entries.forEach(({ path, manifest }, index) => {
      if (index >= keep) {
        rmSync(path);
        manifests += 1;
      } else for (const file of manifest.files) referenced.add(file.sha256);
    });
  }
  const objectRoot = join(store, "objects");
  if (!existsSync(objectRoot)) return { manifests, objects };
  for (const prefix of readdirSync(objectRoot))
    for (const digest of readdirSync(join(objectRoot, prefix)))
      if (HEX.test(digest) && !referenced.has(digest)) {
        rmSync(join(objectRoot, prefix, digest));
        objects += 1;
      }
  return { manifests, objects };
}

export function defaultStore(): string {
  if (process.env.SHENRON_ARTIFACT_STORE) return process.env.SHENRON_ARTIFACT_STORE;
  return join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".cache/shenron/artifacts");
}

async function main(argv: string[]) {
  const take = (name: string, fallback: string) => {
    const index = argv.indexOf(name);
    if (index < 0) return fallback;
    const value = argv[index + 1]!;
    argv.splice(index, 2);
    return value;
  };
  const store = take("--store", defaultStore());
  const root = resolve(take("--root", process.cwd()));
  const keep = Number(take("--keep", "8"));
  const [command, lane, key, ...paths] = argv;
  switch (command) {
    case "has":
      process.exit(has(store, lane!, key!) ? 0 : 1);
    case "put": {
      const manifest = await put(store, root, lane!, key!, paths);
      console.log(`${lane}: stored ${manifest.files.length} files as ${key!.slice(0, 12)}`);
      return;
    }
    case "get": {
      const manifest = await get(store, root, lane!, key!);
      console.log(`${lane}: restored ${manifest.files.length} files from ${key!.slice(0, 12)}`);
      return;
    }
    case "prune":
      console.log(JSON.stringify(prune(store, keep)));
      return;
    default:
      console.error("usage: artifacts.ts has|put|get|prune (see the header of this file)");
      process.exit(64);
  }
}

if (import.meta.main) await main(process.argv.slice(2));
