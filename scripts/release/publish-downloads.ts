#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Publishes the files of one release into the public releases directory served by `/download`
 * and `/api/releases` (SHENRON_RELEASES_DIR, see apps/site/src/lib/releases.ts):
 *
 *   bun scripts/release/publish-downloads.ts --out <dir> [--version X.Y.Z] <file-or-dir>...
 *
 * The directory always holds exactly one release: files of an older one are removed, the new
 * ones are copied flat, then SHA256SUMS and finally latest.json (the switch readers see) are
 * written atomically. Files that are not recognised release assets are ignored.
 */
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export type Kind = "studio" | "server" | "cli" | "mcp" | "bot";
export interface Classified {
  os: "windows" | "linux";
  arch: "x64";
  kind: Kind;
}

/** Maps a build output file name to its platform and kind, `null` when it is not an asset. */
export function classify(name: string): Classified | null {
  const lower = name.toLowerCase();
  const os =
    /(^|[-_.])(windows|win64|win)([-_.]|$)/.test(lower) || lower.endsWith(".exe")
      ? "windows"
      : /(^|[-_.])linux([-_.]|$)/.test(lower) || /\.(appimage|deb)$/.test(lower)
        ? "linux"
        : null;
  if (!os) return null;
  const kind: Kind | null = /studio/.test(lower)
    ? "studio"
    : lower.startsWith("shenron-server")
      ? "server"
      : lower.startsWith("shenron-bot")
        ? "bot"
        : lower.startsWith("shenron-mcp")
          ? "mcp"
          : /^shenron-(cli-)?(windows|linux)|^shenron-cli|^shenron(\.exe)?$/.test(lower)
            ? "cli"
            : null;
  return kind ? { os, arch: "x64", kind } : null;
}

async function collect(inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    const info = await stat(input);
    if (info.isDirectory()) {
      for (const entry of await readdir(input, { withFileTypes: true }))
        if (entry.isFile()) files.push(join(input, entry.name));
    } else files.push(input);
  }
  return files;
}

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

export async function publish(out: string, version: string, inputs: string[]): Promise<number> {
  const assets: Record<string, unknown>[] = [];
  const sources = new Map<string, string>();
  for (const path of await collect(inputs)) {
    const name = basename(path);
    const info = classify(name);
    if (info && !sources.has(name)) sources.set(name, path);
  }
  if (sources.size === 0) throw new Error("No release asset found in the inputs");
  await mkdir(out, { recursive: true });
  const keep = new Set(["latest.json", "SHA256SUMS"]);
  for (const entry of await readdir(out)) {
    const stem = entry.replace(/\.sig$/, "");
    if (!sources.has(stem) && !keep.has(entry)) await rm(join(out, entry), { force: true });
  }
  const sums: string[] = [];
  for (const [name, path] of [...sources].toSorted(([a], [b]) => a.localeCompare(b))) {
    const target = join(out, name);
    await copyFile(path, target);
    const sig = `${path}.sig`;
    if (await stat(sig).catch(() => null)) await copyFile(sig, `${target}.sig`);
    const hash = await sha256(target);
    sums.push(`${hash}  ${name}`);
    assets.push({ name, ...classify(name), size: (await stat(target)).size, sha256: hash });
  }
  const atomic = async (name: string, body: string) => {
    await writeFile(join(out, `${name}.tmp`), body);
    await rename(join(out, `${name}.tmp`), join(out, name));
  };
  await atomic("SHA256SUMS", sums.join("\n") + "\n");
  await atomic(
    "latest.json",
    JSON.stringify({ version, publishedAt: new Date().toISOString(), assets }, null, 2) + "\n",
  );
  return assets.length;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const take = (flag: string) => {
    const i = args.indexOf(flag);
    return i < 0 ? undefined : args.splice(i, 2)[1];
  };
  const out = take("--out");
  const root = resolve(import.meta.dir, "../..");
  const version =
    take("--version") ??
    (await readFile(join(root, "Cargo.toml"), "utf8")).match(
      /\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
    )?.[1];
  if (!out || !version || args.length === 0)
    throw new Error(
      "Usage: bun scripts/release/publish-downloads.ts --out <dir> [--version X.Y.Z] <file|dir>...",
    );
  const count = await publish(
    resolve(out),
    version,
    args.map((a) => resolve(a)),
  );
  console.log(JSON.stringify({ out: resolve(out), version, assets: count }));
}
