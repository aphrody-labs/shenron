import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDbxv2Server,
  DiskCache,
  isWildcardHost,
  loadBackend,
  parseRange,
  type Dbxv2Backend,
  type IndexEntry,
} from "./dbxv2-serve.ts";

const TOKEN = "test-token-0123456789abcdef";
const auth = { Authorization: `Bearer ${TOKEN}` };

describe("helpers", () => {
  test("parseRange", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBeNull();
    expect(parseRange("nonsense", 100)).toBe("none");
  });
  test("wildcard bind is refused", () => {
    expect(isWildcardHost("0.0.0.0")).toBe(true);
    expect(isWildcardHost("127.0.0.1")).toBe(false);
    const stub = {} as Dbxv2Backend;
    expect(() =>
      createDbxv2Server({
        token: TOKEN,
        cpkDir: ".",
        cacheDir: ".",
        cacheMaxBytes: 1,
        backend: stub,
        hostname: "0.0.0.0",
      }),
    ).toThrow();
    expect(() =>
      createDbxv2Server({
        token: "short",
        cpkDir: ".",
        cacheDir: ".",
        cacheMaxBytes: 1,
        backend: stub,
      }),
    ).toThrow();
  });
  test("disk cache evicts the oldest files beyond its bound", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dbxv2-cache-"));
    try {
      const cache = new DiskCache(dir, 150);
      await cache.put("a", new Uint8Array(100));
      await Bun.sleep(20);
      await cache.put("b", new Uint8Array(100));
      expect(await cache.has("a")).toBeNull();
      expect(await cache.has("b")).not.toBeNull();
      expect(await cache.size()).toBeLessThanOrEqual(150);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** Backend factice : verifie le routage, l'authentification, Range, ETag et le cache sans CPK reels. */
describe("server with a stub backend", () => {
  let dir: string;
  let base: string;
  let stop: () => void;
  let pngCalls = 0;
  const payload = Uint8Array.from({ length: 256 }, (_, i) => i);
  const entry = (path: string): IndexEntry => ({
    cpk: "demo",
    path,
    offset: 1,
    size: 256,
    extract_size: 256,
    compressed: false,
  });
  const stub: Dbxv2Backend = {
    cpkFind: (_f, q) =>
      q === "none" ? [] : [entry(q && !q.includes("*") && !q.startsWith("ext:") ? q : "a/b.emb")],
    cpkRead: (_f, _e, range) =>
      payload.slice(range?.start ?? 0, range ? range.start + range.length : undefined),
    embToPng: () => {
      pngCalls += 1;
      return Uint8Array.of(0x89, 0x50, 0x4e, 0x47);
    },
    audioToWav: () => [Uint8Array.of(1, 2, 3)],
    usmToVideo: () => Uint8Array.of(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70),
    modelJson: (name) => ({ name }),
    modelGlb: () => Uint8Array.of(0x67, 0x6c, 0x54, 0x46),
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "dbxv2-serve-"));
    await writeFile(join(dir, "demo.cpk"), "x");
    const server = createDbxv2Server({
      token: TOKEN,
      cpkDir: dir,
      cacheDir: join(dir, "cache"),
      cacheMaxBytes: 1 << 20,
      backend: stub,
      port: 0,
    });
    base = `http://127.0.0.1:${server.port}`;
    stop = () => server.stop(true);
  });
  afterAll(async () => {
    stop();
    await rm(dir, { recursive: true, force: true });
  });

  test("401 without a token, with a wrong token, or a non-bearer scheme", async () => {
    expect((await fetch(`${base}/cpk`)).status).toBe(401);
    expect(
      (await fetch(`${base}/cpk`, { headers: { Authorization: "Bearer wrong" } })).status,
    ).toBe(401);
    expect((await fetch(`${base}/cpk`, { headers: { Authorization: TOKEN } })).status).toBe(401);
    expect((await fetch(`${base}/cpk/demo/raw/a/b.emb`)).status).toBe(401);
  });

  test("list, find", async () => {
    const list = (await (await fetch(`${base}/cpk`, { headers: auth })).json()) as {
      name: string;
    }[];
    expect(list.map((c) => c.name)).toEqual(["demo"]);
    const found = (await (
      await fetch(`${base}/cpk/demo/find?q=ext:emb`, { headers: auth })
    ).json()) as { total: number };
    expect(found.total).toBe(1);
  });

  test("raw: Range, ETag, private cache headers", async () => {
    const res = await fetch(`${base}/cpk/demo/raw/a/b.emb`, {
      headers: { ...auth, Range: "bytes=10-19" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 10-19/256");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(payload.slice(10, 20));
    const etag = res.headers.get("etag")!;
    const again = await fetch(`${base}/cpk/demo/raw/a/b.emb`, {
      headers: { ...auth, "If-None-Match": etag },
    });
    expect(again.status).toBe(304);
    expect(
      (await fetch(`${base}/cpk/demo/raw/a/b.emb`, { headers: { ...auth, Range: "bytes=999-" } }))
        .status,
    ).toBe(416);
  });

  test("png is converted once then served from the disk cache", async () => {
    const first = await fetch(`${base}/cpk/demo/png/a/b.emb?index=2`, { headers: auth });
    expect(first.headers.get("content-type")).toBe("image/png");
    await first.arrayBuffer();
    await (await fetch(`${base}/cpk/demo/png/a/b.emb?index=2`, { headers: auth })).arrayBuffer();
    expect(pngCalls).toBe(1);
  });

  test("wav, video, model", async () => {
    expect(
      (await fetch(`${base}/cpk/demo/wav/x.acb?cue=0`, { headers: auth })).headers.get(
        "content-type",
      ),
    ).toBe("audio/wav");
    expect((await fetch(`${base}/cpk/demo/wav/x.acb?cue=5`, { headers: auth })).status).toBe(404);
    expect(
      (await fetch(`${base}/cpk/demo/video/x.usm`, { headers: auth })).headers.get("content-type"),
    ).toBe("video/mp4");
    const glb = await fetch(`${base}/cpk/demo/model/c/x.emd.glb`, { headers: auth });
    expect(glb.headers.get("content-type")).toBe("model/gltf-binary");
    const js = (await (
      await fetch(`${base}/cpk/demo/model/c/x.emd.json`, { headers: auth })
    ).json()) as { name: string };
    expect(js.name).toBe("x");
  });

  test("unknown cpk and traversal are rejected", async () => {
    expect((await fetch(`${base}/cpk/nope/find`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${base}/cpk/..%2Fetc/find`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${base}/cpk/demo/raw/a%2F..%2Fx`, { headers: auth })).status).toBe(400);
  });
});

/** Echantillon reel de chaque format : DBXV2_LIVE=1 (+ DBXV2_CPK_DIR, DBXV2_PKG_DIR) sur la fabrique. */
const live = process.env.DBXV2_LIVE === "1";
describe.if(live)("live: one real sample per format", () => {
  setDefaultTimeout(180_000);
  const cpkDir =
    process.env.DBXV2_CPK_DIR ?? "/games/SteamLibrary/steamapps/common/DB Xenoverse 2/cpk";
  let base: string;
  let stop: () => void;
  let backend: Awaited<ReturnType<typeof loadBackend>>;
  let cacheDir: string;

  const sample = async (
    cpks: string[],
    query: string,
  ): Promise<{ cpk: string; path: string } | null> => {
    for (const cpk of cpks) {
      const hit = backend.cpkFind(join(cpkDir, `${cpk}.cpk`), query)[0];
      if (hit) return { cpk, path: hit.path };
    }
    return null;
  };
  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { headers: { ...auth, ...headers } });
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  beforeAll(async () => {
    backend = await loadBackend(
      process.env.DBXV2_PKG_DIR ??
        join(process.env.HOME ?? "", "src/bun-os/packages/shenron-dbxv2"),
      process.env.DBXV2_LIB,
    );
    cacheDir = await mkdtemp(join(tmpdir(), "dbxv2-live-"));
    const server = createDbxv2Server({
      token: TOKEN,
      cpkDir,
      cacheDir,
      cacheMaxBytes: 512 << 20,
      backend,
      port: 0,
    });
    base = `http://127.0.0.1:${server.port}`;
    stop = () => server.stop(true);
  });
  afterAll(async () => {
    stop?.();
    backend?.close();
    await rm(cacheDir, { recursive: true, force: true });
  });

  test("raw with Range on a real entry", async () => {
    const s = (await sample(["data2", "data_as"], ""))!;
    const res = await get(`/cpk/${s.cpk}/raw/${enc(s.path)}`, { Range: "bytes=0-15" });
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(16);
  });
  test("emb -> png", async () => {
    const s = (await sample(["data1", "data"], "data/ui/texture/*.emb"))!;
    expect(s).not.toBeNull();
    const res = await get(`/cpk/${s.cpk}/png/${enc(s.path)}`);
    expect(res.status).toBe(200);
    expect([...new Uint8Array(await res.arrayBuffer()).slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });
  test("acb -> wav", async () => {
    const s = await sample(["data_d2_bgm1", "data_d7_bgm2", "data0", "data"], "ext:acb");
    expect(s).not.toBeNull();
    const res = await get(`/cpk/${s!.cpk}/wav/${enc(s!.path)}?cue=0`);
    // un ACB en flux n'a pas de forme d'onde embarquee (AWB voisin) : 404 documente
    expect([200, 404]).toContain(res.status);
    if (res.status === 200)
      expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 4))).toBe("RIFF");
  });
  test("usm -> video", async () => {
    const s = await sample(["movie_p2", "movie3", "movie_p4"], "ext:usm");
    expect(s).not.toBeNull();
    const res = await get(`/cpk/${s!.cpk}/video/${enc(s!.path)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^video\//);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
  test("emd -> model json and glb", async () => {
    const s = await sample(["data_d4_5_xv1", "data1", "data", "data_as"], "ext:emd");
    expect(s).not.toBeNull();
    const js = await get(`/cpk/${s!.cpk}/model/${enc(s!.path)}.json`);
    expect(js.status).toBe(200);
    expect(((await js.json()) as { vertices: number }).vertices).toBeGreaterThanOrEqual(0);
    const glb = await get(`/cpk/${s!.cpk}/model/${enc(s!.path)}.glb`);
    expect(glb.status).toBe(200);
    expect(new TextDecoder().decode((await glb.arrayBuffer()).slice(0, 4))).toBe("glTF");
  });
});
