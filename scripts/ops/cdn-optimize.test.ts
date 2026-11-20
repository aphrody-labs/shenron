// SPDX-License-Identifier: Apache-2.0
// End-to-end proof of scripts/release/cdn-optimize.ts on generated fixtures. Image and video
// cases need their encoders (magick, cwebp) and the matching optimizers; a case whose
// tools are absent is skipped, never faked.
// oxlint-disable no-await-in-loop -- ordered tree hash and per-file assertions.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  brotliDecompressSync,
  constants as zlibConstants,
  gunzipSync,
  zstdCompressSync,
  zstdDecompressSync,
} from "node:zlib";
import { decodedHash, mp4NeedsFaststart } from "./cdn-optimize.ts";

const script = join(import.meta.dir, "cdn-optimize.ts");
const has = (...names: string[]): boolean => names.every((n) => Bun.which(n) !== null);
// Native video qualification uses an explicit real, authorized local media source.
const videoSource = process.env.SHENRON_VIDEO_TEST_SOURCE;
let root = "";
let src = "";
let out = "";
let state = "";

async function sh(cmd: string[]): Promise<void> {
  const p = Bun.spawn(cmd, { windowsHide: true, stdout: "ignore", stderr: "pipe" });
  const code = await p.exited;
  if (code !== 0) throw new Error(`${cmd[0]} failed: ${await new Response(p.stderr).text()}`);
}

interface Report {
  files: number;
  kinds: Record<
    string,
    { processed: number; optimized: number; errors: number; srcBytes: number; outBytes: number }
  >;
  siblings: { br: number; zst: number; gz: number };
  deleted: number;
  dedup: { linked: number };
  errors: unknown[];
}

async function optimize(...extra: string[]): Promise<Report> {
  const p = Bun.spawn(
    ["bun", script, "--src", src, "--out", out, "--state", state, "--jobs", "4", ...extra],
    { windowsHide: true, stdout: "pipe", stderr: "pipe" },
  );
  const [text, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`cdn-optimize exited ${code}: ${err}\n${text}`);
  return JSON.parse(text) as Report;
}

async function treeHash(dir: string): Promise<string> {
  const h = new Bun.CryptoHasher("sha256");
  const files = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dir, dot: true }));
  for (const rel of files.toSorted()) {
    h.update(rel + "\0");
    for await (const chunk of Bun.file(join(dir, rel)).stream()) h.update(chunk);
  }
  return h.digest("hex");
}

async function fileHash(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cdn-optimize-"));
  src = join(root, "src");
  out = join(root, "out");
  state = join(root, "state", "manifest.sqlite");
  await mkdir(join(src, "js"), { recursive: true });
  await mkdir(join(src, "img"), { recursive: true });
  const js = "export const greeting = 'hello, world';\n".repeat(200);
  await Bun.write(join(src, "js", "app.js"), js);
  await Bun.write(join(src, "js", "copy.js"), js);
  await Bun.write(join(src, "tiny.txt"), "ok\n");
  if (has("magick")) {
    await sh([
      "magick",
      "-size",
      "96x64",
      "gradient:red-blue",
      "-define",
      "png:compression-level=0",
      "png24:" + join(src, "img", "gradient.png"),
    ]);
    await sh([
      "magick",
      "-size",
      "128x96",
      "plasma:fractal",
      "-seed",
      "7",
      "-quality",
      "92",
      "-define",
      "jpeg:optimize-coding=false",
      join(src, "img", "plasma.jpg"),
    ]);
    await sh([
      "magick",
      "-size",
      "32x32",
      "xc:red",
      "xc:blue",
      "xc:red",
      "-set",
      "delay",
      "10",
      "-loop",
      "0",
      join(src, "img", "blink.gif"),
    ]);
  }
  if (has("magick", "cwebp")) {
    await sh(["magick", "-size", "64x64", "gradient:green-yellow", join(root, "w.png")]);
    await sh([
      "cwebp",
      "-quiet",
      "-lossless",
      "-z",
      "0",
      join(root, "w.png"),
      "-o",
      join(src, "img", "lossless.webp"),
    ]);
  }
  if (videoSource) await Bun.write(join(src, "clip.mp4"), Bun.file(videoSource));
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("cdn-optimize", () => {
  let first: Report;
  let srcBefore = "";

  test("first run publishes every file and never writes the source", async () => {
    srcBefore = await treeHash(src);
    first = await optimize();
    expect(first.errors).toEqual([]);
    expect(await treeHash(src)).toBe(srcBefore);
    const sources = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: src }));
    for (const rel of sources) expect(await Bun.file(join(out, rel)).exists()).toBe(true);
  });

  test("text gets verified brotli and gzip siblings; tiny files do not", async () => {
    const original = await Bun.file(join(src, "js", "app.js")).bytes();
    const br = await Bun.file(join(out, "js", "app.js.br")).bytes();
    const gz = await Bun.file(join(out, "js", "app.js.gz")).bytes();
    expect(Buffer.compare(brotliDecompressSync(br), original)).toBe(0);
    expect(Buffer.compare(gunzipSync(gz), original)).toBe(0);
    expect(br.length).toBeLessThan(original.length * 0.95);
    expect(await Bun.file(join(out, "tiny.txt.br")).exists()).toBe(false);
  });

  test("text gets a verified zstd level 19 sibling, smaller than the edge's level 3", async () => {
    const original = await Bun.file(join(src, "js", "app.js")).bytes();
    const zst = await Bun.file(join(out, "js", "app.js.zst")).bytes();
    expect(Buffer.compare(zstdDecompressSync(zst), original)).toBe(0);
    expect(zst.length).toBeLessThan(original.length * 0.95);
    const level3 = zstdCompressSync(original, {
      params: { [zlibConstants.ZSTD_c_compressionLevel]: 3 },
    });
    expect(zst.length).toBeLessThanOrEqual(level3.length);
    expect(await Bun.file(join(out, "tiny.txt.zst")).exists()).toBe(false);
    expect(first.siblings.zst).toBeGreaterThanOrEqual(1);
  });

  test("a state written before .zst siblings existed republishes text once to gain them", async () => {
    const legacy = join(root, "legacy");
    const legacySrc = join(legacy, "src");
    const legacyOut = join(legacy, "out");
    const legacyState = join(legacy, "state", "manifest.sqlite");
    await mkdir(join(legacy, "state"), { recursive: true });
    await mkdir(legacySrc, { recursive: true });
    await Bun.write(join(legacySrc, "a.json"), JSON.stringify({ k: "v".repeat(2000) }));
    const run = async (): Promise<Report> => {
      const p = Bun.spawn(
        [
          "bun",
          script,
          "--src",
          legacySrc,
          "--out",
          legacyOut,
          "--state",
          legacyState,
          "--jobs",
          "2",
        ],
        { windowsHide: true, stdout: "pipe", stderr: "pipe" },
      );
      const [text, err, code] = await Promise.all([
        new Response(p.stdout).text(),
        new Response(p.stderr).text(),
        p.exited,
      ]);
      if (code !== 0) throw new Error(`cdn-optimize exited ${code}: ${err}`);
      return JSON.parse(text) as Report;
    };
    await run();
    await unlink(join(legacyOut, "a.json.zst"));
    const db = new Database(legacyState);
    db.exec("ALTER TABLE files DROP COLUMN zst_size");
    db.close();
    const again = await run();
    expect(again.siblings.zst).toBe(1);
    expect(await Bun.file(join(legacyOut, "a.json.zst")).exists()).toBe(true);
  });

  test("an interrupted .zst backfill resumes on the next run without --force", async () => {
    const resume = join(root, "resume");
    const resumeSrc = join(resume, "src");
    const resumeOut = join(resume, "out");
    const resumeState = join(resume, "state", "manifest.sqlite");
    await mkdir(join(resume, "state"), { recursive: true });
    await mkdir(resumeSrc, { recursive: true });
    await Bun.write(join(resumeSrc, "a.json"), JSON.stringify({ k: "v".repeat(2000) }));
    await Bun.write(join(resumeSrc, "b.json"), JSON.stringify({ k: "w".repeat(2000) }));
    const run = async (): Promise<Report> => {
      const p = Bun.spawn(
        [
          "bun",
          script,
          "--src",
          resumeSrc,
          "--out",
          resumeOut,
          "--state",
          resumeState,
          "--jobs",
          "2",
        ],
        { windowsHide: true, stdout: "pipe", stderr: "pipe" },
      );
      const [text, err, code] = await Promise.all([
        new Response(p.stdout).text(),
        new Response(p.stderr).text(),
        p.exited,
      ]);
      if (code !== 0) throw new Error(`cdn-optimize exited ${code}: ${err}`);
      return JSON.parse(text) as Report;
    };
    await run();
    // State of a run killed after the ALTER: the column exists, the flag is pending, and the
    // rows not yet republished still have no zst_size and no .zst sibling.
    await unlink(join(resumeOut, "a.json.zst"));
    await unlink(join(resumeOut, "b.json.zst"));
    const db = new Database(resumeState);
    db.exec("UPDATE files SET zst_size = NULL WHERE path = 'a.json'");
    db.exec("UPDATE files SET zst_size = NULL WHERE path = 'b.json'");
    db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('zst_backfill', 'pending')");
    db.close();
    const again = await run();
    expect(again.siblings.zst).toBe(2);
    expect(await Bun.file(join(resumeOut, "a.json.zst")).exists()).toBe(true);
    expect(await Bun.file(join(resumeOut, "b.json.zst")).exists()).toBe(true);
    const after = new Database(resumeState);
    expect(after.query("SELECT value FROM meta WHERE key = 'zst_backfill'").get()).toBeNull();
    after.close();
  });

  test("byte-identical outputs share one inode", async () => {
    const a = await stat(join(out, "js", "app.js"));
    const b = await stat(join(out, "js", "copy.js"));
    expect(a.ino).toBe(b.ino);
    expect((await stat(join(out, "js", "app.js.br"))).ino).toBe(
      (await stat(join(out, "js", "copy.js.br"))).ino,
    );
    expect((await stat(join(out, "js", "app.js.zst"))).ino).toBe(
      (await stat(join(out, "js", "copy.js.zst"))).ino,
    );
    expect(first.dedup.linked).toBeGreaterThan(0);
  });

  const lossless = (rel: string, kind: "png" | "jpeg" | "gif" | "webp" | "mp4") => async () => {
    const s = join(src, rel);
    const o = join(out, rel);
    expect(Bun.file(o).size).toBeLessThanOrEqual(
      kind === "mp4" ? Bun.file(s).size * 1.001 : Bun.file(s).size,
    );
    expect(first.kinds[kind]?.optimized).toBeGreaterThan(0);
    const a = await decodedHash(kind, s);
    expect(a).not.toBeNull();
    expect(await decodedHash(kind, o)).toBe(a);
  };
  test.skipIf(!has("magick") || !(has("oxipng") || has("zopflipng")))(
    "PNG is smaller with identical pixels",
    lossless("img/gradient.png", "png"),
  );
  test.skipIf(!has("magick", "jpegtran", "djpeg"))(
    "JPEG is smaller with identical pixels",
    lossless("img/plasma.jpg", "jpeg"),
  );
  test.skipIf(!has("magick", "gifsicle"))(
    "GIF keeps identical frames and delays",
    lossless("img/blink.gif", "gif"),
  );
  test.skipIf(!has("magick", "cwebp", "dwebp", "webpmux"))(
    "lossless WebP is re-encoded with identical pixels",
    lossless("img/lossless.webp", "webp"),
  );
  test.skipIf(!videoSource)(
    "native MP4 optimization preserves real media or retains the source",
    async () => {
      const source = join(src, "clip.mp4");
      const served = join(out, "clip.mp4");
      const reference = await decodedHash("mp4", source);
      if (first.kinds.mp4?.optimized) {
        expect(reference).not.toBeNull();
        expect(await decodedHash("mp4", served)).toBe(reference);
        expect(await mp4NeedsFaststart(served)).toBe(false);
      } else {
        expect(await fileHash(served)).toBe(await fileHash(source));
      }
    },
  );

  test("unsupported native video cannot pass a lossless proof", async () => {
    const invalid = join(root, "invalid.mp4");
    await Bun.write(invalid, "not a video");
    expect(await decodedHash("mp4", invalid)).toBeNull();
  });

  test("second run is incremental", async () => {
    const again = await optimize();
    const processed = Object.values(again.kinds).reduce((n, k) => n + k.processed, 0);
    expect(processed).toBe(0);
    expect(again.errors).toEqual([]);
  });

  test("a file removed from the source leaves the served tree with its siblings", async () => {
    await unlink(join(src, "js", "copy.js"));
    const r = await optimize();
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(await Bun.file(join(out, "js", "copy.js")).exists()).toBe(false);
    expect(await Bun.file(join(out, "js", "copy.js.br")).exists()).toBe(false);
    expect(await Bun.file(join(out, "js", "copy.js.zst")).exists()).toBe(false);
    expect(await Bun.file(join(out, "js", "app.js.br")).exists()).toBe(true);
    expect(await Bun.file(join(out, "js", "app.js.zst")).exists()).toBe(true);
  });

  test("an empty source is refused", async () => {
    const empty = join(root, "empty");
    await mkdir(empty, { recursive: true });
    const p = Bun.spawn(["bun", script, "--src", empty, "--out", out, "--state", state], {
      windowsHide: true,
      stdout: "ignore",
      stderr: "pipe",
    });
    expect(await p.exited).not.toBe(0);
    expect(await Bun.file(join(out, "js", "app.js")).exists()).toBe(true);
  });
});
