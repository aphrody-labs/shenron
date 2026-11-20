import { expect, test } from "bun:test";
import { Dbxv2Client } from "../src/client";
import { dbxv2DbPath, dbxv2Status } from "../src/env";
import { dbxv2Plugin } from "../src/plugin";

test("explicit public production config never includes private environment values", () => {
  const env = {
    NODE_ENV: "production",
    SHENRON_PROFILE: "public",
    DBXV2_CLIENT_MODE: "public",
    DBXV2_PUBLIC_URL: "https://assets.example.test/xv2",
    DBXV2_TOKEN: "private-token",
    DBXV2_DB_PATH: "/private/steam.sqlite",
  };
  expect(dbxv2Status(env)).toEqual({
    enabled: true,
    config: { mode: "public", baseUrl: env.DBXV2_PUBLIC_URL },
  });
  expect(dbxv2DbPath(env)).toBeNull();
  for (const baseUrl of [
    "https://u:p@example.test",
    "https://example.test?token=x",
    "http://example.test",
  ]) {
    expect(() => new Dbxv2Client({ mode: "public", baseUrl })).toThrow();
  }
  expect(
    () =>
      new Dbxv2Client({ mode: "public", baseUrl: "https://example.test", token: "x".repeat(20) }),
  ).toThrow();
});

test("public GET, range and cached reads omit authentication and cookies", async () => {
  const calls: RequestInit[] = [];
  let now = 0;
  const client = new Dbxv2Client({
    mode: "public",
    baseUrl: "https://assets.example.test/xv2",
    cache: { ttlMs: 100, now: () => now },
    fetch: (async (_url, init) => {
      calls.push(init!);
      if (calls.length === 2) return new Response(null, { status: 304 });
      return new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          "content-range": "bytes 0-1/4",
          "content-type": "application/octet-stream",
          etag: '"v1"',
        },
      });
    }) as typeof fetch,
  });
  const first = await client.raw("CHARA/a.emb", { range: { start: 0, end: 1 } });
  const second = await client.raw("CHARA/a.emb", { range: { start: 0, end: 1 } });
  expect(first.bytes).toEqual(new Uint8Array([1, 2]));
  expect(second.bytes).toEqual(first.bytes);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ method: "GET", credentials: "omit", redirect: "error" });
  const headers = new Headers(calls[0]!.headers);
  expect(headers.has("authorization")).toBe(false);
  expect(headers.has("cookie")).toBe(false);
  expect(headers.get("range")).toBe("bytes=0-1");
  now = 101;
  expect((await client.raw("CHARA/a.emb", { range: { start: 0, end: 1 } })).bytes).toEqual(
    first.bytes,
  );
  const revalidation = new Headers(calls[1]!.headers);
  expect(revalidation.get("if-none-match")).toBe('"v1"');
  expect(revalidation.has("authorization")).toBe(false);
});

test("production plugin publishes only manifest-approved derivatives without private runtime", async () => {
  const hash = "a".repeat(64);
  const key = "dbxv2:CHARA/a.emb?png";
  let load: ((args: { path: string }) => unknown) | undefined;
  const plugin = dbxv2Plugin({
    env: { NODE_ENV: "production" },
    publicAssets: {
      [key]: {
        url: `https://assets.example.test/${hash}/a.png`,
        sha256: hash,
        provenance: "Owner-approved derivative",
      },
    },
  });
  plugin.setup({
    config: { minify: true },
    onResolve() {},
    onLoad(_filter: unknown, callback: typeof load) {
      load = callback;
    },
  } as unknown as Bun.PluginBuilder);
  const result = load!({ path: key }) as { contents: string };
  expect(result.contents).toContain(hash);
  expect(result.contents).not.toContain("runtime");
  expect(result.contents).not.toContain("@dbxv2-private");
  expect(() => load!({ path: "dbxv2:CHARA/other.emb?raw" })).toThrow();
});
