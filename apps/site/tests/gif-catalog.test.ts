import { afterEach, expect, mock, test } from "bun:test";
import {
  GIF_ASSET_BASE,
  GIF_CATALOG_INDEX_URL,
  GIF_INDEX_URL,
  GIF_SOURCE_SHA256,
  gifPage,
  gifQuery,
  parseGifIndex,
} from "../src/lib/gif-catalog-contract";
mock.module("server-only", () => ({}));
const { readGifCatalog } = await import("../src/lib/gif-catalog");
const { GET: list } = await import("../src/app/api/gifs/route");
const { GET: download } = await import("../src/app/api/gifs/[id]/download/route");
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const hash = "a".repeat(64);
const item = (id = "sample") => ({
  id,
  gifUrl: `${GIF_ASSET_BASE}gifs/${id}.gif`,
  posterUrl: `${GIF_ASSET_BASE}storyboard/frame-0360.webp`,
  width: 640,
  height: 360,
  bytes: 12,
  sha256: hash,
  posterSha256: hash,
  startSeconds: 360,
  durationSeconds: 5.08,
});
const index = (items = [item()]) => ({
  schema: "shenron-public-gifs/v1",
  revision: hash,
  episodeId: 875,
  sourceSha256: GIF_SOURCE_SHA256,
  qualified: true,
  items,
});

test("public projection strips private metadata and keeps measured durations", () => {
  const parsed = parseGifIndex({
    ...index(),
    privatePath: "private/source.mp4",
    items: [{ ...item(), title: "Unverified character", privatePath: "private/frame.png" }],
  });
  expect(parsed.items[0]?.durationSeconds).toBe(5.08);
  expect(parsed.items[0]?.key).toBe("875-sample");
  expect(JSON.stringify(parsed)).not.toContain("private");
  expect(JSON.stringify(parsed)).not.toContain("Unverified");
});

test("qualification, CDN namespace, provenance and bounded unique assets are mandatory", () => {
  expect(() => parseGifIndex({ ...index(), qualified: false })).toThrow();
  expect(() =>
    parseGifIndex(index([{ ...item(), gifUrl: "https://google.com/private.gif" }])),
  ).toThrow();
  expect(() =>
    parseGifIndex(
      index([{ ...item(), posterUrl: `${GIF_ASSET_BASE}storyboard/frame-0360.webp?token=secret` }]),
    ),
  ).toThrow();
  expect(() => parseGifIndex(index([item(), item()]))).toThrow();
  expect(() =>
    parseGifIndex(index(Array.from({ length: 65 }, (_, i) => item(`sample-${i}`)))),
  ).toThrow();
});

test("catalogue supports multiple episodes without name collisions", () => {
  const otherBase = `https://cdn.dragonballfr.com/media/episodes/10/${hash}/`;
  const parsed = parseGifIndex({
    ...index(),
    items: [
      item(),
      {
        ...item(),
        episodeId: 10,
        sourceSha256: hash,
        gifUrl: `${otherBase}gifs/sample.gif`,
        posterUrl: `${otherBase}frames/frame-000010.png`,
      },
    ],
  });
  expect(parsed.items.map((entry) => entry.key)).toEqual(["875-sample", "10-sample"]);
});

test("search and pagination operate on a bounded index pinned to a revision", () => {
  const parsed = parseGifIndex(index(Array.from({ length: 25 }, (_, i) => item(`sample-${i}`))));
  expect(gifPage(parsed, gifQuery({ page: "2" })).items).toHaveLength(12);
  expect(gifPage(parsed, gifQuery({ page: "3" })).items).toHaveLength(1);
  expect(gifPage(parsed, gifQuery({ q: "sample-24" })).total).toBe(1);
  expect(() => gifPage(parsed, gifQuery({ revision: "b".repeat(64) }))).toThrow("revision changed");
  expect(() => gifQuery({ page: "-1" })).toThrow();
  expect(gifPage(null, gifQuery({}))).toMatchObject({ available: false, total: 0, items: [] });
});

test("reader uses the aggregate projection with a qualified episode-index fallback", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    urls.push(String(url));
    expect(options?.credentials).toBe("omit");
    return url === GIF_CATALOG_INDEX_URL
      ? new Response(null, { status: 404 })
      : Response.json(index());
  }) as unknown as typeof fetch;
  expect((await readGifCatalog()).total).toBe(1);
  expect(urls).toEqual([GIF_CATALOG_INDEX_URL, GIF_INDEX_URL]);
});

test("oversized, mislabeled and truncated projection responses fail honestly", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>invalid</html>", {
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
  await expect(readGifCatalog()).rejects.toThrow();
  globalThis.fetch = (async () =>
    new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "999999" },
    })) as unknown as typeof fetch;
  await expect(readGifCatalog()).rejects.toThrow();
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(index()), {
      headers: { "content-type": "application/json", "content-length": "1" },
    })) as unknown as typeof fetch;
  await expect(readGifCatalog()).rejects.toThrow("size differs");
});

test("API validates queries and distinguishes missing publication from failure", async () => {
  expect((await list(new Request("https://example.test/api/gifs?page=-1"))).status).toBe(400);
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  expect(await (await list(new Request("https://example.test/api/gifs"))).json()).toMatchObject({
    available: false,
    items: [],
  });
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
  expect((await list(new Request("https://example.test/api/gifs"))).status).toBe(503);
});

test("download is same-origin, bounded and verified against the published artifact hash", async () => {
  const bytes = new TextEncoder().encode("GIF89a-test");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const published = index([
    ...Array.from({ length: 13 }, (_, i) => item(`sample-${i}`)),
    { ...item(), bytes: bytes.length, sha256: sha },
  ]);
  globalThis.fetch = (async (url: string) =>
    url === item().gifUrl
      ? new Response(bytes, {
          headers: { "content-type": "image/gif", "content-length": String(bytes.length) },
        })
      : Response.json(published)) as unknown as typeof fetch;
  const response = await download(
    new Request("https://example.test/api/gifs/875-sample/download"),
    { params: Promise.resolve({ id: "875-sample" }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(
    (
      await download(
        new Request("https://example.test/api/gifs/875-sample/download?revision=invalid"),
        { params: Promise.resolve({ id: "875-sample" }) },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await download(
        new Request(`https://example.test/api/gifs/875-sample/download?revision=${"f".repeat(64)}`),
        { params: Promise.resolve({ id: "875-sample" }) },
      )
    ).status,
  ).toBe(409);
  globalThis.fetch = (async (url: string) =>
    url === item().gifUrl
      ? new Response(new Uint8Array(bytes.length), { headers: { "content-type": "image/gif" } })
      : Response.json(published)) as unknown as typeof fetch;
  expect(
    (
      await download(new Request("https://example.test/api/gifs/875-sample/download"), {
        params: Promise.resolve({ id: "875-sample" }),
      })
    ).status,
  ).toBe(503);
});
