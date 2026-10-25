// SPDX-License-Identifier: Apache-2.0
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export interface EpisodeSourceFile {
  relativePath: string;
  bytes: number;
  sha256: string;
  kind: "video" | "har" | "html" | "asset";
}

export function parseEpisodeSourceFiles(value: unknown): EpisodeSourceFile[] {
  if (!Array.isArray(value) || value.length > 100_000)
    throw new Error("Invalid episode source inventory");
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.relativePath !== "string" ||
      entry.relativePath.length > 4096 ||
      Array.from(entry.relativePath as string).some((char) => char.charCodeAt(0) < 32) ||
      entry.relativePath.split(/[\\/]/).includes("..") ||
      isAbsolute(entry.relativePath) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !["video", "har", "html", "asset"].includes(entry.kind)
    )
      throw new Error("Invalid episode source inventory");
    return {
      relativePath: entry.relativePath,
      bytes: entry.bytes,
      sha256: entry.sha256,
      kind: entry.kind,
    };
  });
}

/** Inventories every local source without executing downloaded HTML or JavaScript. */
export async function inventoryEpisodeDirectory(directory: string) {
  const root = realpathSync(directory);
  const files: EpisodeSourceFile[] = [];
  for await (const name of new Bun.Glob("**/*").scan({
    cwd: root,
    onlyFiles: true,
    followSymlinks: false,
    dot: true,
  })) {
    const path = join(root, name);
    if (lstatSync(path).isSymbolicLink())
      throw new Error("Episode source symlinks are not supported");
    const resolved = realpathSync(path);
    const local = relative(root, resolved);
    if (isAbsolute(local) || local === ".." || local.startsWith("../") || local.startsWith("..\\"))
      throw new Error("Episode source escapes its directory");
    const file = Bun.file(resolved);
    const digest = new Bun.CryptoHasher("sha256");
    for await (const chunk of file.stream()) digest.update(chunk);
    const lower = name.toLowerCase();
    const kind = /\.(mp4|webm|mkv|mov)$/.test(lower)
      ? "video"
      : lower.endsWith(".har")
        ? "har"
        : lower.endsWith(".html")
          ? "html"
          : "asset";
    files.push({
      relativePath: local.replaceAll("\\", "/"),
      bytes: file.size,
      sha256: digest.digest("hex"),
      kind,
    });
  }
  return { root, files: files.toSorted((a, b) => a.relativePath.localeCompare(b.relativePath)) };
}
