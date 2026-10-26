// SPDX-License-Identifier: Apache-2.0
import { dirname, join, resolve } from "node:path";

/** Uploaded images live beside the bot database, on the existing writable data volume. */
export function wikiImageRoots(databasePath: string, cwd = process.cwd()): string[] {
  return [
    resolve(cwd, dirname(databasePath), "wiki-uploads"),
    resolve(cwd, "../site/public/wiki"),
    resolve(cwd, "assets/wiki"),
  ];
}

function validRelativeImage(path: string): boolean {
  return Boolean(path) && !path.includes("..") && !/[\\\0:]/.test(path) && !path.startsWith("/");
}

export async function writeWikiImage(
  bytes: Uint8Array,
  subdir: string,
  extension: string,
  roots: readonly string[],
): Promise<string> {
  if (
    !roots[0] ||
    (subdir && !/^[a-z0-9-]{1,32}$/.test(subdir)) ||
    !/^\.(?:png|jpg|webp|gif)$/.test(extension)
  )
    throw new Error("Invalid wiki image destination");
  const relative = [subdir, `${crypto.randomUUID()}${extension}`].filter(Boolean).join("/");
  await Bun.write(join(roots[0], relative), bytes, { createPath: true });
  return `./assets/wiki/${relative}`;
}

/** A persistent upload wins; old assets remain readable without copying or moving them. */
export async function findWikiImage(
  relative: string,
  roots: readonly string[],
): Promise<ReturnType<typeof Bun.file> | null> {
  if (!validRelativeImage(relative)) return null;
  for (const root of roots) {
    const file = Bun.file(join(root, relative));
    if (await file.exists()) return file;
  }
  return null;
}

export async function listWikiImages(
  roots: readonly string[],
  limit = 1000,
): Promise<{ path: string; url: string; name: string }[]> {
  const files = new Map<string, { path: string; url: string; name: string }>();
  for (const root of roots) {
    try {
      const glob = new Bun.Glob("**/*.{png,jpg,jpeg,webp,gif}");
      for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
        const relative = path.replaceAll("\\", "/");
        if (!validRelativeImage(relative) || files.has(relative)) continue;
        const asset = `assets/wiki/${relative}`;
        files.set(relative, { path: asset, url: `/${asset}`, name: relative });
        if (files.size >= limit)
          return [...files.values()].toSorted((a, b) => a.name.localeCompare(b.name));
      }
    } catch {
      // Missing historical roots are expected in a sealed image.
    }
  }
  return [...files.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}
