import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  Dbxv2AbortError,
  Dbxv2AuthError,
  Dbxv2BusyError,
  Dbxv2ChangedError,
  Dbxv2ConfigError,
  Dbxv2NotFoundError,
  Dbxv2RangeError,
  Dbxv2SchemaError,
  attempt,
  createDbxv2Client,
  type Dbxv2Client,
} from "../src";
import { patterned, startFakeServer, TOKEN, type FakeServer } from "./fake-server";

let server: FakeServer;
let client: Dbxv2Client;
const BIG = patterned(1000);

beforeAll(() => {
  server = startFakeServer([
    { cpk: "CHARA", path: "a/one.emb", bytes: patterned(64, 3) },
    { cpk: "CHARA", path: "a/two.emb", bytes: patterned(64, 4) },
    { cpk: "CHARA", path: "a/model.emd", bytes: patterned(16) },
    { cpk: "CHARA", path: "big.bin", bytes: BIG },
    { cpk: "BGM", path: "theme.acb", bytes: patterned(32) },
    { cpk: "BGM", path: "clip.usm", bytes: patterned(32) },
  ]);
});
afterAll(() => server.stop());
beforeEach(() => {
  server.requests.length = 0;
  server.delay = 0;
  client = createDbxv2Client({ baseUrl: server.url, token: TOKEN, retryDelayMs: 1 });
});

describe("configuration", () => {
  test("rejects a short token, a wildcard host and a non-http URL", () => {
    expect(() => createDbxv2Client({ baseUrl: server.url, token: "short" })).toThrow(
      Dbxv2ConfigError,
    );
    expect(() => createDbxv2Client({ baseUrl: "http://0.0.0.0:1", token: TOKEN })).toThrow(
      Dbxv2ConfigError,
    );
    expect(() => createDbxv2Client({ baseUrl: "ftp://x", token: TOKEN })).toThrow(Dbxv2ConfigError);
  });

  test("never prints the token", () => {
    expect(JSON.stringify(client)).not.toContain(TOKEN);
    expect(String(Object.values(client.toJSON()))).not.toContain(TOKEN);
  });
});

describe("JSON endpoints", () => {
  test("health needs no token", async () => {
    const anonymous = createDbxv2Client({ baseUrl: server.url, token: TOKEN });
    expect(await anonymous.health()).toEqual({ ok: true });
    expect(server.requests[0]?.headers.get("authorization")).toBeNull();
  });

  test("cpks and find are validated and paged", async () => {
    expect((await client.cpks()).map((c) => c.name)).toEqual(["BGM", "CHARA"]);
    const page = await client.find("CHARA", { q: "ext:emb", limit: 1 });
    expect(page.total).toBe(2);
    expect(page.entries).toHaveLength(1);
    const all: string[] = [];
    for await (const entry of client.findAll("CHARA", { pageSize: 2 })) all.push(entry.path);
    expect(all.toSorted()).toEqual(["a/model.emd", "a/one.emb", "a/two.emb", "big.bin"]);
  });

  test("token travels in the Authorization header, never in the URL", async () => {
    await client.find("CHARA");
    for (const r of server.requests) {
      expect(r.path).not.toContain(TOKEN);
      expect(r.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    }
  });

  test("a malformed body is a Dbxv2SchemaError", async () => {
    const bad = createDbxv2Client({
      baseUrl: server.url,
      token: TOKEN,
      fetch: (async () =>
        new Response(JSON.stringify({ total: "x" }), {
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch,
    });
    const result = await attempt(() => bad.find("CHARA"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Dbxv2SchemaError);
      expect((result.error as Dbxv2SchemaError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe("errors", () => {
  test("401, 404 and 416 map to typed errors", async () => {
    const wrong = createDbxv2Client({ baseUrl: server.url, token: "x".repeat(20) });
    await expect(wrong.cpks()).rejects.toBeInstanceOf(Dbxv2AuthError);
    await expect(client.raw("CHARA/missing.bin")).rejects.toBeInstanceOf(Dbxv2NotFoundError);
    await expect(client.raw("CHARA/big.bin", { range: { start: 5000 } })).rejects.toBeInstanceOf(
      Dbxv2RangeError,
    );
  });

  test("503 is retried, then surfaces as Dbxv2BusyError", async () => {
    server.failNext(503, 1);
    expect(await client.cpks()).toHaveLength(2);
    client.clearCache();
    server.failNext(503, 10);
    try {
      await expect(client.cpks()).rejects.toBeInstanceOf(Dbxv2BusyError);
    } finally {
      server.failNext(503, 0);
    }
  });

  test("attempt() returns a Result for typed errors only", async () => {
    const result = await attempt(() => client.raw("CHARA/missing.bin"));
    expect(result.ok).toBe(false);
    await expect(attempt(() => Promise.reject(new TypeError("boom")))).rejects.toThrow("boom");
  });

  test("invalid references are rejected before any request", async () => {
    await expect(client.raw("nope")).rejects.toBeInstanceOf(Dbxv2ConfigError);
    await expect(client.raw("CHARA/../x")).rejects.toBeInstanceOf(Dbxv2ConfigError);
    expect(server.requests).toHaveLength(0);
  });
});

describe("binary endpoints", () => {
  test("raw with a range answers 206 and Content-Range", async () => {
    const part = await client.raw("CHARA/big.bin", { range: { start: 10, end: 19 } });
    expect(part.status).toBe(206);
    expect(part.contentRange).toEqual({ start: 10, end: 19, size: 1000 });
    expect([...part.bytes]).toEqual([...BIG.subarray(10, 20)]);
    const tail = await client.raw("CHARA/big.bin", { range: { suffix: 4 } });
    expect([...tail.bytes]).toEqual([...BIG.subarray(996)]);
  });

  test("png, wav, video and model formats", async () => {
    const png = await client.png({ cpk: "CHARA", path: "a/one.emb" }, { index: 1 });
    expect(png.contentType).toBe("image/png");
    expect(server.requests.at(-1)?.path).toContain("index=1");
    expect((await client.wav("BGM/theme.acb", { cue: 2 })).contentType).toBe("audio/wav");
    expect((await client.video("BGM/clip.usm")).contentType).toBe("video/mp4");
    expect((await client.mp4("BGM/clip.usm")).contentType).toBe("video/mp4");
    expect(server.requests.at(-1)?.path).toContain("/mp4/");
    const model = await client.modelJson("CHARA/a/model.emd", { emb: "a/one.emb" });
    expect(model.primitives[0]?.indices).toEqual([0, 1, 2]);
    expect(server.requests.at(-1)?.path).toContain("emb=a%2Fone.emb");
    expect((await client.modelGlb("CHARA/a/model.emd")).contentType).toBe("model/gltf-binary");
  });
});

describe("cache and de-duplication", () => {
  test("identical concurrent requests share one fetch", async () => {
    server.delay = 30;
    const [a, b, c] = await Promise.all([
      client.raw("CHARA/big.bin"),
      client.raw("CHARA/big.bin"),
      client.raw("CHARA/big.bin"),
    ]);
    expect(a.bytes).toBe(b.bytes);
    expect(c.bytes.byteLength).toBe(1000);
    expect(server.requests.filter((r) => r.path.includes("/raw/"))).toHaveLength(1);
  });

  test("a fresh entry is served from memory, a stale one is revalidated with If-None-Match", async () => {
    let now = 0;
    const timed = createDbxv2Client({
      baseUrl: server.url,
      token: TOKEN,
      cache: { ttlMs: 1000, now: () => now },
    });
    await timed.raw("CHARA/big.bin");
    await timed.raw("CHARA/big.bin");
    expect(server.requests).toHaveLength(1);
    now = 5000;
    const again = await timed.raw("CHARA/big.bin");
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]?.headers.get("if-none-match")).toBeTruthy();
    expect(again.bytes.byteLength).toBe(1000);
    expect(timed.cacheStats.entries).toBe(1);
  });

  test("the cache can be disabled", async () => {
    const plain = createDbxv2Client({ baseUrl: server.url, token: TOKEN, cache: false });
    await plain.raw("CHARA/big.bin");
    await plain.raw("CHARA/big.bin");
    expect(server.requests).toHaveLength(2);
  });
});

describe("cancellation", () => {
  test("an aborted signal rejects with Dbxv2AbortError", async () => {
    server.delay = 200;
    const controller = new AbortController();
    const pending = client.raw("CHARA/big.bin", { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toBeInstanceOf(Dbxv2AbortError);
    expect(client.raw("CHARA/big.bin", { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      Dbxv2AbortError,
    );
  });

  test("one caller aborting does not cancel the shared fetch of the others", async () => {
    server.delay = 80;
    const controller = new AbortController();
    const first = client.raw("CHARA/big.bin", { signal: controller.signal });
    const second = client.raw("CHARA/big.bin");
    setTimeout(() => controller.abort(), 10);
    await expect(first).rejects.toBeInstanceOf(Dbxv2AbortError);
    expect((await second).bytes.byteLength).toBe(1000);
  });
});

describe("ranged download and resume", () => {
  test("rebuilds the entry from chunks with progress", async () => {
    const progress: number[] = [];
    const whole = await client.download("CHARA/big.bin", {
      chunkSize: 300,
      onProgress: (received) => progress.push(received),
    });
    expect([...whole.bytes]).toEqual([...BIG]);
    expect(whole.size).toBe(1000);
    expect(progress).toEqual([300, 600, 900, 1000]);
    expect(server.requests.filter((r) => r.headers.get("range"))).toHaveLength(4);
  });

  test("a failure keeps the partial bytes, which resume the download", async () => {
    let calls = 0;
    const flaky = createDbxv2Client({
      baseUrl: server.url,
      token: TOKEN,
      retries: 0,
      cache: false,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls++;
        if (calls === 3) throw new TypeError("connection reset");
        return fetch(input, init);
      }) as typeof fetch,
    });
    let partialBytes = 0;
    let saved;
    try {
      await flaky.download("CHARA/big.bin", { chunkSize: 300 });
    } catch (error) {
      saved = (error as { partial?: { bytes: Uint8Array; etag: string; size: number } }).partial;
      partialBytes = saved?.bytes.byteLength ?? 0;
    }
    expect(partialBytes).toBe(600);
    server.requests.length = 0;
    const done = await flaky.download("CHARA/big.bin", { chunkSize: 300, resume: saved });
    expect([...done.bytes]).toEqual([...BIG]);
    expect(server.requests[0]?.headers.get("range")).toBe("bytes=600-899");
    expect(server.requests[0]?.headers.get("if-range")).toBe(saved?.etag ?? "");
  });

  test("an entry changed since the partial download is refused", async () => {
    const first = await client.raw("CHARA/big.bin", { range: { start: 0, end: 99 } });
    server.mutate("CHARA", "big.bin", patterned(1000, 99));
    const failing = client.download("CHARA/big.bin", {
      chunkSize: 300,
      resume: { bytes: first.bytes, etag: first.etag ?? "", size: 1000 },
    });
    await expect(failing).rejects.toBeInstanceOf(Dbxv2ChangedError);
    server.mutate("CHARA", "big.bin", BIG);
  });
});
