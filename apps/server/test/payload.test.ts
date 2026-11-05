// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import { extract, pack, prunePayloadCache, publicVfsProblems } from "../src/payload";
import { writeTestVfs } from "./support";

const root = mkdtempSync(join(tmpdir(), "shenron-payload-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fixture(): Record<string, string> {
  const site = join(root, "src", "site");
  mkdirSync(join(site, "static", "chunks"), { recursive: true });
  writeFileSync(join(site, "server.js"), "console.log('next');\n");
  writeFileSync(join(site, "static", "chunks", "app.js"), "export {};\n");
  writeFileSync(join(site, "launch.sh"), "#!/bin/sh\n", { mode: 0o755 });
  // Creation permissions are filtered by the job umask; the archive must receive
  // an explicitly executable fixture rather than inheriting the private job mode.
  if (process.platform !== "win32") chmodSync(join(site, "launch.sh"), 0o755);
  const lib = join(root, "src", "libshenron_ffi.so");
  writeFileSync(lib, new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 1, 2, 3]));
  return { site, "libshenron_ffi.so": lib };
}

function payloadFile(name: string, bytes: Uint8Array): string {
  const file = join(root, name);
  writeFileSync(file, bytes);
  return file;
}

/** The packer before it read files straight into the archive buffer: one Buffer per file. */
function referencePack(sources: Record<string, string>, level: number): Uint8Array {
  const entries: { path: string; size: number; mode: number }[] = [];
  const chunks: Uint8Array[] = [];
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  for (const [prefix, source] of Object.entries(sources)) {
    const directory = statSync(source).isDirectory();
    for (const file of (directory ? walk(source) : [source]).toSorted()) {
      const bytes = readFileSync(file);
      const rel = directory ? relative(source, file).split(sep).join("/") : "";
      entries.push({
        path: [prefix, rel].filter(Boolean).join("/"),
        size: bytes.byteLength,
        mode: statSync(file).mode & 0o777,
      });
      chunks.push(bytes);
    }
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ entries }));
  const magic = new TextEncoder().encode("SHENRONPAK1
");
  const header = new Uint8Array(magic.length + 4);
  header.set(magic);
  new DataView(header.buffer).setUint32(magic.length, manifest.byteLength, true);
  return Bun.zstdCompressSync(Buffer.concat([header, manifest, ...chunks]), { level });
}

describe("payload", () => {
  test("pack writes the same bytes as the per-file Buffer packer", () => {
    const sources = fixture();
    const empty = join(root, "src", "empty.bin");
    writeFileSync(empty, new Uint8Array(0));
    const big = join(root, "src", "big.bin");
    writeFileSync(big, Uint8Array.from({ length: 3_000_000 }, (_, i) => (i * 31) & 0xff));
    const all = { ...sources, "empty.bin": empty, "big.bin": big };
    expect(Buffer.compare(pack(all, 3), referencePack(all, 3))).toBe(0);
  });

  test("pack then extract restores every file under its archive prefix", async () => {
    const file = payloadFile("roundtrip.zst", pack(fixture(), 1));
    const cache = join(root, "cache-roundtrip");
    const { dir, extracted } = await extract(file, cache);
    expect(extracted).toBe(true);
    expect(readFileSync(join(dir, "site", "server.js"), "utf8")).toBe("console.log('next');\n");
    expect(readFileSync(join(dir, "site", "static", "chunks", "app.js"), "utf8")).toBe(
      "export {};\n",
    );
    expect([...readFileSync(join(dir, "libshenron_ffi.so"))]).toEqual([
      0x7f, 0x45, 0x4c, 0x46, 0, 1, 2, 3,
    ]);
    expect(existsSync(join(dir, ".complete"))).toBe(true);
    if (process.platform !== "win32")
      expect(statSync(join(dir, "site", "launch.sh")).mode & 0o777).toBe(0o755);
  });

  test("a complete extraction is reused for the same payload", async () => {
    const file = payloadFile("reuse.zst", pack(fixture(), 1));
    const cache = join(root, "cache-reuse");
    const first = await extract(file, cache);
    const second = await extract(file, cache);
    expect(second.dir).toBe(first.dir);
    expect(second.extracted).toBe(false);
  });

  test.skipIf(process.platform === "win32")("private executable modes remain private", async () => {
    const source = join(root, "private-launch.sh");
    writeFileSync(source, "#!/bin/sh\n", { mode: 0o700 });
    chmodSync(source, 0o700);
    const file = payloadFile("private-mode.zst", pack({ "launch.sh": source }, 1));
    const { dir } = await extract(file, join(root, "cache-private-mode"));
    expect(statSync(join(dir, "launch.sh")).mode & 0o777).toBe(0o700);
  });

  test("a payload without the magic header is refused", async () => {
    const file = payloadFile(
      "bad-magic.zst",
      Bun.zstdCompressSync(new TextEncoder().encode("NOTAPAYLOAD\n\0\0\0\0")),
    );
    await expect(extract(file, join(root, "cache-bad"))).rejects.toThrow("bad magic");
  });

  test("an entry escaping the cache directory is refused", async () => {
    const magic = new TextEncoder().encode("SHENRONPAK1\n");
    const manifest = new TextEncoder().encode(
      JSON.stringify({ entries: [{ path: "../evil", size: 1, mode: 0o644 }] }),
    );
    const raw = new Uint8Array(magic.byteLength + 4 + manifest.byteLength + 1);
    raw.set(magic);
    new DataView(raw.buffer).setUint32(magic.byteLength, manifest.byteLength, true);
    raw.set(manifest, magic.byteLength + 4);
    const file = payloadFile("unsafe.zst", Bun.zstdCompressSync(raw));
    const cache = join(root, "cache-unsafe");
    await expect(extract(file, cache)).rejects.toThrow("unsafe payload path");
    expect(existsSync(join(root, "evil"))).toBe(false);
  });

  test("a fresh extraction prunes older payloads but keeps the current and the newest other one", () => {
    const cache = join(root, "cache-prune");
    const make = (name: string, ageSeconds: number) => {
      const dir = join(cache, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, ".complete"), "done");
      const when = new Date(Date.now() - ageSeconds * 1000);
      utimesSync(dir, when, when);
      return dir;
    };
    make("payload-oldest", 400);
    make("payload-older", 300);
    make("payload-previous", 100);
    make("payload-aaaa.tmp-123", 50);
    const current = make("payload-current", 0);
    writeFileSync(join(cache, "payload-stamp.json"), "{}");
    mkdirSync(join(cache, "episode-video"));
    prunePayloadCache(cache, current);
    expect(existsSync(current)).toBe(true);
    expect(existsSync(join(cache, "payload-previous"))).toBe(true);
    expect(existsSync(join(cache, "payload-older"))).toBe(false);
    expect(existsSync(join(cache, "payload-oldest"))).toBe(false);
    expect(existsSync(join(cache, "payload-aaaa.tmp-123"))).toBe(false);
    expect(existsSync(join(cache, "payload-stamp.json"))).toBe(true);
    expect(existsSync(join(cache, "episode-video"))).toBe(true);
  });
});

describe("public VFS guard", () => {
  test("a public build passes", () => {
    expect(publicVfsProblems(writeTestVfs(join(root, "vfs", "public.sqlite")))).toEqual([]);
  });

  test("a complet build, private rows, conversations and embedded nodes are refused", () => {
    const file = writeTestVfs(join(root, "vfs", "complet.sqlite"), {
      profile: "complet",
      private: true,
      conversations: true,
      embedded: true,
    });
    expect(publicVfsProblems(file)).toEqual([
      "VFS profile is complet, not public",
      "1 private VFS nodes",
      "1 private RAG documents",
      "1 conversation documents",
      "1 embedded nodes (rebuild the VFS without --embed-assets)",
    ]);
  });

  test("a file that is not a VFS is refused", () => {
    const file = join(root, "vfs", "junk.sqlite");
    writeFileSync(file, "junk");
    expect(publicVfsProblems(file)[0]).toStartWith("not a Shenron VFS");
  });
});
