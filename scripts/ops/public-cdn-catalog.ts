// SPDX-License-Identifier: Apache-2.0
import { mkdir, realpath, lstat } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";

export const catalogPrefix = "/catalog/assets";
export interface PublicAsset {
  path: string;
  mime: string;
  size: number;
  sha256: string | null;
}
export interface PageDescriptor {
  url: string;
  count: number;
  sha256: string;
}
export interface DirectoryDescriptor {
  path: string;
  fileCount: number;
  directoryCount: number;
  pages: PageDescriptor[];
}
export interface CatalogIndex {
  schema: "shenron-public-cdn/v1";
  revision: string;
  observedAt: string;
  inventorySha256: string;
  totalFiles: number;
  totalBytes: number;
  totalFolders: number;
  pageSize: number;
  files: { pages: PageDescriptor[] };
  folders: { shardTemplate: string; shards: Record<string, string> };
}
export interface CatalogPage {
  revision: string;
  path: string | null;
  page: number;
  totalPages: number;
  entries: PublicAsset[];
}
interface Inventory {
  createdAt: string;
  entries: Record<string, { sha256: string; size: number; contentType: string }>;
}
export const digest = (value: string | Uint8Array): string =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
const lexical = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const hashPattern = /^[a-f0-9]{64}$/;
const hasControls = (value: string): boolean =>
  [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

/** Decode repeatedly so encoded traversal cannot enter a public directory lookup. */
export function validateAssetPath(path: string): void {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.endsWith("/") ||
    path.length > 8192 ||
    /[?#]/.test(path)
  )
    throw new Error("Invalid public asset path");
  let decoded = path;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (decoded.includes("\\") || hasControls(decoded)) throw new Error("Unsafe public asset path");
    const parts = decoded.slice(1).split("/");
    if (
      parts.length > 64 ||
      parts.some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /^(?:_objects|_migration|private|cookies|node_modules|\.ssh|\.git|\.codex|\.claude|\.aphrody|\.env(?:\..*)?)$/i.test(
            part,
          ),
      )
    )
      throw new Error("Unsafe public asset segment");
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      // A literal percent sign is a valid inventory path; malformed escapes are not traversal.
      if (/%[a-f0-9]{2}/i.test(decoded)) throw new Error("Ambiguous public asset encoding");
      return;
    }
    if (next === decoded) return;
    decoded = next;
  }
  throw new Error("Excessively encoded public asset path");
}

export function projectCatalog(
  inventory: Inventory,
  inventorySha256: string,
  pageSize = 96,
): { index: CatalogIndex; artifacts: Map<string, string> } {
  if (
    !hashPattern.test(inventorySha256) ||
    !inventory ||
    typeof inventory.createdAt !== "string" ||
    !Number.isFinite(Date.parse(inventory.createdAt)) ||
    !inventory.entries ||
    Array.isArray(inventory.entries) ||
    typeof inventory.entries !== "object" ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 500
  )
    throw new Error("Invalid pinned public inventory");
  const paths = Object.keys(inventory.entries).toSorted(lexical);
  if (paths.length > 1_000_000) throw new Error("Public inventory exceeds bounded capacity");
  const files: PublicAsset[] = [];
  for (const path of paths) {
    validateAssetPath(path);
    if (path === catalogPrefix || path.startsWith(catalogPrefix + "/")) continue;
    const value = inventory.entries[path];
    if (
      !value ||
      !hashPattern.test(value.sha256) ||
      !Number.isSafeInteger(value.size) ||
      value.size < 0 ||
      typeof value.contentType !== "string" ||
      !value.contentType ||
      hasControls(value.contentType)
    )
      throw new Error("Invalid public asset metadata");
    files.push({ path, mime: value.contentType, size: value.size, sha256: value.sha256 });
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (!Number.isSafeInteger(totalBytes)) throw new Error("Public inventory byte count overflow");
  // The revision excludes this projection and private inventory metadata.
  const revision = digest(JSON.stringify({ pageSize, files }));
  const base = `${catalogPrefix}/revisions/${revision}`;
  const artifacts = new Map<string, string>();
  const directories = new Map<string, Map<string, PublicAsset>>([["/", new Map()]]);
  for (const file of files) {
    const parts = file.path.slice(1).split("/");
    let parent = "/";
    for (const part of parts.slice(0, -1)) {
      const child = parent + part + "/";
      if (!directories.has(child)) directories.set(child, new Map());
      directories.get(parent)!.set(child, {
        path: child,
        mime: "inode/directory",
        size: 0,
        sha256: null,
      });
      parent = child;
    }
    directories.get(parent)!.set(file.path, file);
  }
  const pages = (
    entries: PublicAsset[],
    folder: string | null,
    prefix: string,
  ): PageDescriptor[] => {
    const result: PageDescriptor[] = [];
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    for (let page = 0; page < totalPages; page++) {
      const subset = entries.slice(page * pageSize, (page + 1) * pageSize);
      const url = `${prefix}/page-${page.toString().padStart(6, "0")}.json`;
      const value: CatalogPage = { revision, path: folder, page, totalPages, entries: subset };
      const body = JSON.stringify(value);
      artifacts.set(url, body);
      result.push({ url, count: subset.length, sha256: digest(body) });
    }
    return result;
  };
  const shards: Record<string, Record<string, DirectoryDescriptor>> = {};
  for (const path of [...directories.keys()].toSorted(lexical)) {
    const children = [...directories.get(path)!.values()].toSorted((a, b) =>
      lexical(a.path, b.path),
    );
    const key = digest(path);
    const directory: DirectoryDescriptor = {
      path,
      fileCount: children.filter((entry) => entry.sha256 !== null).length,
      directoryCount: children.filter((entry) => entry.sha256 === null).length,
      pages: pages(children, path, `${base}/folders/${key}`),
    };
    (shards[key.slice(0, 2)] ??= {})[path] = directory;
  }
  const hashes: Record<string, string> = {};
  for (let shard = 0; shard < 256; shard++) {
    const key = shard.toString(16).padStart(2, "0");
    const body = JSON.stringify(shards[key] ?? {});
    artifacts.set(`${base}/directories/${key}.json`, body);
    hashes[key] = digest(body);
  }
  const index: CatalogIndex = {
    schema: "shenron-public-cdn/v1",
    revision,
    observedAt: inventory.createdAt,
    inventorySha256,
    totalFiles: files.length,
    totalBytes,
    totalFolders: directories.size,
    pageSize,
    files: { pages: pages(files, null, `${base}/files`) },
    folders: { shardTemplate: `${base}/directories/{shard}.json`, shards: hashes },
  };
  artifacts.set(`${catalogPrefix}/index.json`, JSON.stringify(index));
  return { index, artifacts };
}

/** Create a fresh reviewed public root; publication remains owned by Infra. */
export async function run(args: string[]): Promise<void> {
  if (args.includes("--help")) {
    console.log(
      "public-cdn-catalog --inventory FILE --inventory-sha256 HASH --out NEW_PUBLIC_ROOT [--page-size 96]",
    );
    return;
  }
  const flag = (name: string): string => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`);
    return args[index + 1]!;
  };
  const bytes = await Bun.file(resolve(flag("--inventory"))).bytes();
  const inventorySha256 = flag("--inventory-sha256");
  if (digest(bytes) !== inventorySha256) throw new Error("Pinned inventory SHA256 differs");
  const result = projectCatalog(
    JSON.parse(new TextDecoder().decode(bytes)) as Inventory,
    inventorySha256,
    args.includes("--page-size") ? Number(flag("--page-size")) : 96,
  );
  const out = resolve(flag("--out"));
  // Refuse existing outputs, including symlinks, rather than overwrite an active projection.
  if (
    await lstat(out).then(
      () => true,
      () => false,
    )
  )
    throw new Error("Public output must be new");
  await mkdir(out, { recursive: false, mode: 0o700 });
  const base = await realpath(out);
  for (const [url, body] of result.artifacts) {
    const target = join(base, url.slice(1));
    const local = relative(base, target);
    if (local.startsWith("..") || isAbsolute(local))
      throw new Error("Projection escaped public root");
    await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
    await Bun.write(target, body, { mode: 0o600 });
  }
  console.log(
    JSON.stringify({
      revision: result.index.revision,
      inventorySha256,
      indexSha256: digest(result.artifacts.get(`${catalogPrefix}/index.json`)!),
      totalFiles: result.index.totalFiles,
      totalFolders: result.index.totalFolders,
      artifacts: result.artifacts.size,
      observedAt: result.index.observedAt,
    }),
  );
}

if (import.meta.main) await run(Bun.argv.slice(2));
