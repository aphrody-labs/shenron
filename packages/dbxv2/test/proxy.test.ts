import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Dbxv2ConfigError, Dbxv2DisabledError, createDbxv2Proxy, type Dbxv2Proxy } from "../src";
import { patterned, startFakeServer, TOKEN, type FakeServer } from "./fake-server";

let upstream: FakeServer;
let proxy: Dbxv2Proxy;
let now = Date.now();
const BIG = patterned(500);

beforeAll(() => {
  upstream = startFakeServer([
    { cpk: "CHARA", path: "a/one.emb", bytes: patterned(32) },
    { cpk: "CHARA", path: "big.bin", bytes: BIG },
    { cpk: "BGM", path: "theme.acb", bytes: patterned(32) },
  ]);
  proxy = createDbxv2Proxy({
    upstream: { baseUrl: upstream.url, token: TOKEN },
    now: () => now,
    ttlSeconds: 60,
    env: {},
  });
});
afterAll(() => {
  proxy.stop();
  upstream.stop();
});

describe("signed URLs", () => {
  test("serve a PNG without the token appearing in any URL", async () => {
    const url = proxy.url.png("CHARA/a/one.emb", { index: 2 });
    expect(url.startsWith("http://127.0.0.1:")).toBe(true);
    expect(url).not.toContain(TOKEN);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-site");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const seen = upstream.requests.at(-1)!;
    expect(seen.path).toContain("index=2");
    expect(seen.path).not.toContain("sig=");
    expect(seen.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("forwards Range and answers 206", async () => {
    const res = await fetch(proxy.url.raw("CHARA/big.bin"), { headers: { Range: "bytes=10-19" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 10-19/500");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...BIG.subarray(10, 20)]);
  });

  test("audio, video and model URLs map to the right routes", async () => {
    expect(
      (await fetch(proxy.url.audio("BGM/theme.acb", { cue: 1 }))).headers.get("content-type"),
    ).toBe("audio/wav");
    expect(upstream.requests.at(-1)?.path).toContain("/wav/");
    expect((await fetch(proxy.url.modelGlb("CHARA/a/one.emd"))).status).toBe(404);
    expect(upstream.requests.at(-1)?.path).toContain("/model/a/one.emd.glb");
  });

  test("a tampered signature, parameter or path is refused", async () => {
    const url = new URL(proxy.url.png("CHARA/a/one.emb", { index: 1 }));
    const tamperedIndex = new URL(url);
    tamperedIndex.searchParams.set("index", "9");
    expect((await fetch(tamperedIndex)).status).toBe(403);
    const tamperedPath = new URL(url);
    tamperedPath.pathname = tamperedPath.pathname.replace("one.emb", "other.emb");
    expect((await fetch(tamperedPath)).status).toBe(403);
    const unsigned = new URL(url);
    unsigned.searchParams.delete("sig");
    expect((await fetch(unsigned)).status).toBe(403);
    const extra = new URL(url);
    extra.searchParams.set("token", "x");
    expect((await fetch(extra)).status).toBe(400);
  });

  test("URLs expire", async () => {
    const url = proxy.url.raw("CHARA/big.bin");
    now += 61_000;
    expect((await fetch(url)).status).toBe(403);
    now -= 61_000;
    expect((await fetch(proxy.sign("raw", "CHARA/big.bin", {}, 1))).status).toBe(200);
  });

  test("only GET and HEAD, no CORS", async () => {
    expect((await fetch(proxy.url.raw("CHARA/big.bin"), { method: "POST" })).status).toBe(405);
    expect((await fetch(`${proxy.origin}/other`)).status).toBe(404);
  });
});

describe("construction", () => {
  test("refuses a public context, a short token and a non-loopback bind", () => {
    const upstreamConfig = { baseUrl: upstream.url, token: TOKEN };
    expect(() =>
      createDbxv2Proxy({ upstream: upstreamConfig, env: { SHENRON_PROFILE: "public" } }),
    ).toThrow(Dbxv2DisabledError);
    expect(() =>
      createDbxv2Proxy({ upstream: { baseUrl: upstream.url, token: "short" }, env: {} }),
    ).toThrow(Dbxv2ConfigError);
    expect(() =>
      createDbxv2Proxy({
        upstream: upstreamConfig,
        env: {},
        hostname: "0.0.0.0" as unknown as "127.0.0.1",
      }),
    ).toThrow(Dbxv2ConfigError);
  });
});
