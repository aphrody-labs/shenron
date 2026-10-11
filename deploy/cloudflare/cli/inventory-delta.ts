// SPDX-License-Identifier: Apache-2.0
import { readdir, stat, realpath, mkdir, writeFile } from "node:fs/promises";
import { join, relative, extname, resolve, sep } from "node:path";
import { digest } from "./cloudflare-ops";

export interface InventoryEntry {
  sha256: string;
  size: number;
  contentType: string;
  cacheControl: string;
  sourcePath: string;
}
const extensions = new Set(
  "jpg jpeg png webp avif svg ico gif mp4 webm mp3 m4a ogg flac wav srt vtt woff woff2 ttf otf eot css js mjs json webmanifest html wasm br gz zip rar 7z pdf txt md wgsl".split(
    " ",
  ),
);

/** Retain old URLs, overlay current public assets, preserve gateway static precedence. */
export function mergeEntries(
  previous: Record<string, InventoryEntry>,
  current: Record<string, InventoryEntry>,
): Record<string, InventoryEntry> {
  const entries = { ...previous };
  for (const [path, entry] of Object.entries(current)) {
    if (
      path.startsWith("/_next/static/") &&
      previous[path]?.sourcePath.startsWith("/srv/shenron-cdn/_next/static/")
    )
      continue;
    entries[path] = entry;
  }
  return entries;
}

async function scan(root: string, prefix: string): Promise<Record<string, InventoryEntry>> {
  const base = await realpath(root);
  const entries: Record<string, InventoryEntry> = {};
  async function walk(directory: string) {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const sourcePath = join(directory, file.name);
      const local = relative(base, sourcePath).replaceAll("\\", "/");
      if (local.split("/").some((part) => part.startsWith(".") && part !== ".well-known")) continue;
      if (file.isSymbolicLink()) throw new Error("Review public symlink before delta inventory");
      if (file.isDirectory()) {
        await walk(sourcePath);
        continue;
      }
      if (!file.isFile() || !extensions.has(extname(file.name).slice(1).toLowerCase())) continue;
      const resolved = await realpath(sourcePath);
      if (!resolved.startsWith(base + sep)) throw new Error("Public source escapes its root");
      const before = await stat(resolved);
      const hash = new Bun.CryptoHasher("sha256");
      for await (const chunk of Bun.file(resolved).stream()) hash.update(chunk);
      const after = await stat(resolved);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
        throw new Error("Public source changed during inventory");
      const path = `${prefix}/${local}`;
      entries[path] = {
        sourcePath: resolved,
        sha256: hash.digest("hex"),
        size: after.size,
        contentType: Bun.file(resolved).type || "application/octet-stream",
        cacheControl: path.startsWith("/_next/static/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=86400, stale-while-revalidate=604800",
      };
    }
  }
  await walk(base);
  return entries;
}

export async function run(args: string[]) {
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0 || !args[i + 1]) throw new Error(`Missing ${name}`);
    return args[i + 1]!;
  };
  if (args.includes("--help")) {
    console.log(
      "inventory-delta --previous FILE --previous-sha256 HASH --site DIR --static DIR --release-public DIR --out DIR",
    );
    return;
  }
  const text = await Bun.file(flag("--previous")).text();
  if (digest(text) !== flag("--previous-sha256")) throw new Error("Previous inventory differs");
  const previous = JSON.parse(text) as { entries: Record<string, InventoryEntry> };
  if (!previous.entries || typeof previous.entries !== "object")
    throw new Error("Previous inventory entries unavailable");
  const site = resolve(flag("--site"));
  const current = {
    ...(await scan(join(site, "public"), "")),
    ...(await scan(resolve(flag("--static")), "/_next/static")),
    ...(await scan(resolve(flag("--release-public")), "")),
  };
  const entries = mergeEntries(previous.entries, current);
  const unique = new Map<string, InventoryEntry & { path: string }>();
  const oldHashes = new Set(Object.values(previous.entries).map((entry) => entry.sha256));
  const shards: Record<string, Record<string, Omit<InventoryEntry, "sourcePath">>> = {};
  for (const path of Object.keys(entries).toSorted()) {
    const { sourcePath, ...entry } = entries[path]!;
    const shard = digest(path).slice(0, 2);
    (shards[shard] ??= {})[path] = entry;
    if (!unique.has(entry.sha256)) unique.set(entry.sha256, { path, sourcePath, ...entry });
  }
  const out = resolve(flag("--out"));
  await mkdir(join(out, "shards"), { recursive: true, mode: 0o700 });
  const hashes: Record<string, string> = {};
  for (let i = 0; i < 256; i++) {
    const key = i.toString(16).padStart(2, "0");
    const body = JSON.stringify(shards[key] ?? {});
    hashes[key] = digest(body);
    await writeFile(join(out, "shards", key + ".json"), body, { mode: 0o600, flag: "wx" });
  }
  const objects = [...unique.values()];
  const report = {
    createdAt: new Date().toISOString(),
    previousSha256: digest(text),
    publicPaths: Object.keys(entries).length,
    uniqueObjects: unique.size,
    addedObjects: objects.filter((entry) => !oldHashes.has(entry.sha256)).length,
    entries,
  };
  for (const [name, value] of Object.entries({
    "inventory.json": report,
    "objects.json": objects,
    "delta-objects.json": objects.filter((entry) => !oldHashes.has(entry.sha256)),
    "shard-hashes.json": hashes,
  }))
    await writeFile(join(out, name), JSON.stringify(value), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ ...report, entries: undefined }));
}
if (import.meta.main)
  run(Bun.argv.slice(2)).catch(() => {
    console.error("Delta inventory failed; review pinned inventory, public roots or output state");
    process.exitCode = 1;
  });
