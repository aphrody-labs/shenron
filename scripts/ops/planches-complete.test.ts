// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HostLimiter,
  computeMissing,
  discoverPage,
  extractImageUrls,
  makeRobotsChecker,
  openStagingDb,
  parseRobots,
  realTiers,
  robotsAllows,
  stageImage,
  verifyImage,
  type CascadeCtx,
} from "./planches-complete.ts";

function png(w: number, h: number, seed = 1): Uint8Array<ArrayBuffer> {
  const raw = new Uint8Array((w * 3 + 1) * h);
  let s = seed;
  for (let i = 0; i < raw.length; i++)
    raw[i] = i % (w * 3 + 1) === 0 ? 0 : ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length);
    body.set(new TextEncoder().encode(type));
    body.set(data, 4);
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(body, 4);
    dv.setUint32(8 + data.length, Bun.hash.crc32(body));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", Bun.deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  return new Uint8Array(Buffer.concat(parts));
}

let server: ReturnType<typeof Bun.serve>;
let base = "";
let dir = "";
const A = png(200, 200, 1);
const B = png(210, 200, 2);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "planches-"));
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const p = new URL(req.url).pathname;
      if (p === "/robots.txt") return new Response("User-agent: *\nDisallow: /private/\n");
      if (p === "/page")
        return new Response(
          `<html><img src="/a.png"><img src="/b.png"><img src="/a-copy.png"><img src="/fake.png"><img src="/private/x.png"></html>`,
          { headers: { "content-type": "text/html" } },
        );
      if (p === "/a.png" || p === "/a-copy.png")
        return new Response(A, { headers: { "content-type": "image/png" } });
      if (p === "/b.png") return new Response(B, { headers: { "content-type": "image/png" } });
      if (p === "/fake.png")
        return new Response("<html>not an image</html>", {
          headers: { "content-type": "image/png" },
        });
      return new Response("nope", { status: 404 });
    },
  });
  base = `http://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

describe("robots", () => {
  test("longest rule wins and allow breaks ties", () => {
    const r = parseRobots("User-agent: *\nDisallow: /a/\nAllow: /a/ok\nCrawl-delay: 2\n");
    expect(robotsAllows(r, "/a/x")).toBe(false);
    expect(robotsAllows(r, "/a/ok")).toBe(true);
    expect(robotsAllows(r, "/b")).toBe(true);
    expect(r.crawlDelayMs).toBe(2000);
  });
  test("specific agent group overrides wildcard", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: ShenronPlanchesBot\nAllow: /\n",
    );
    expect(robotsAllows(r, "/x")).toBe(true);
  });
});

describe("helpers", () => {
  test("extractImageUrls resolves img, srcset, og:image", () => {
    const html = `<meta property="og:image" content="/og.jpg"><img src="a.png" srcset="b.png 1x, c.png 2x"><img src="data:x">`;
    expect(new Set(extractImageUrls(html, "https://x.test/dir/page"))).toEqual(
      new Set([
        "https://x.test/og.jpg",
        "https://x.test/dir/a.png",
        "https://x.test/dir/b.png",
        "https://x.test/dir/c.png",
      ]),
    );
  });
  test("HostLimiter enforces limits", () => {
    expect(() => new HostLimiter(100)).toThrow();
    expect(() => new HostLimiter(600, 4)).toThrow();
  });
  test("verifyImage hashes real images and rejects fakes", async () => {
    const ok = await verifyImage(A, "image/png", { minBytes: 100 });
    expect(ok.ok).toBe(true);
    expect(ok.sha256).toBe(new Bun.CryptoHasher("sha256").update(A).digest("hex"));
    expect([ok.width, ok.height]).toEqual([200, 200]);
    expect(
      (await verifyImage(new TextEncoder().encode("<html>"), "image/png", { minBytes: 1 })).ok,
    ).toBe(false);
    expect((await verifyImage(A, "text/html")).ok).toBe(false);
    expect((await verifyImage(A, "image/png", { minBytes: 10_000_000 })).ok).toBe(false);
  });
  test("computeMissing classifies databook and volume gaps", () => {
    const { counts, items } = computeMissing(
      [
        {
          id: 1,
          kind: "databook",
          title: "A",
          source_url: null,
          pages: [
            { number: 1, image: "x", text: "t" },
            { number: 2, image: null, text: "t" },
            { number: 3, image: "y", text: null },
          ],
        },
        { id: 2, kind: "artbook", title: "B", source_url: "https://s.test", pages: [] },
      ],
      [{ id: 9, series: "S", number: 1, chapters: 4, listedPages: 0, hasListedPages: false }],
    );
    expect(counts).toMatchObject({
      databooksWithoutPages: 1,
      databookPagesWithoutImage: 1,
      databookPagesWithoutText: 1,
      volumesWithoutPages: 1,
      chaptersInVolumesWithoutPages: 4,
    });
    expect(items.map((i) => i.category).toSorted()).toEqual([
      "databook-no-pages",
      "databook-page-no-image",
      "databook-page-no-text",
      "manga-volume-no-pages",
    ]);
  });
});

describe("cascade against a local server", () => {
  test("discovers, stages, dedupes by hash, skips robots and fakes", async () => {
    const db = openStagingDb(join(dir, "s.sqlite"));
    const ctx: CascadeCtx = {
      db,
      tiers: realTiers(10_000).filter((t) => t.name === "fetch"),
      limiter: new HostLimiter(500, 3),
      assetDir: join(dir, "assets"),
      robots: makeRobotsChecker(async (u) => (await fetch(u)).text(), new Set()),
      verify: { minBytes: 100 },
    };
    const found = await discoverPage(ctx, `${base}/page`, "databook:1", "declared: fixture");
    expect(found.tier).toBe("fetch");
    expect(found.images.length).toBe(5);
    const results = [];
    for (const u of found.images)
      results.push(await stageImage(ctx, u, `${base}/page`, "databook:1", "declared: fixture"));
    expect(results.filter((r) => r.ok).length).toBe(3);
    expect(results.filter((r) => r.duplicate).length).toBe(1);
    expect((db.query("SELECT COUNT(*) n FROM assets").get() as { n: number }).n).toBe(2);
    expect((db.query("SELECT COUNT(*) n FROM asset_sources").get() as { n: number }).n).toBe(3);
    const row = db.query("SELECT path FROM assets LIMIT 1").get() as { path: string };
    expect(await Bun.file(join(dir, "assets", row.path)).exists()).toBe(true);
    const fails = db.query("SELECT detail FROM attempts WHERE ok=0").all() as { detail: string }[];
    expect(fails.some((f) => f.detail.includes("robots"))).toBe(true);
    expect(
      fails.some((f) => f.detail.includes("not decodable") || f.detail.includes("too small")),
    ).toBe(true);
  });
});
