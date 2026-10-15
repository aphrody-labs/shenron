import { afterEach, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
let row: Record<string, unknown> = {};
let unavailable = false;
mock.module("../src/lib/db", () => ({
  db: {
    execute: async () => {
      if (unavailable) throw Error("offline");
      return [row];
    },
  },
}));
const { getPublicCorpusStats } = await import("../src/lib/public-corpus-stats");
const previousHost = process.env.SHENRON_HOST_URL;
const server = Bun.serve({
  port: 0,
  fetch: () =>
    Response.json({
      profile: "fixture",
      schemaVersion: null,
      generatedAt: null,
      files: 0,
      dirs: 0,
      bytes: {},
      counts: {},
      rag: { docs: 1, chunks: 17, vectorsF32: 0, vectorsI8: 0, model: null, kinds: {} },
      wiki: 0,
    }),
});
afterEach(() => {
  unavailable = false;
  row = {};
  if (previousHost === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previousHost;
});
test("editorial failure remains unknown while the independently measured public index survives", async () => {
  process.env.SHENRON_HOST_URL = server.url.origin;
  unavailable = true;
  const result = await getPublicCorpusStats();
  expect(result.ragChunks).toBe(17);
  expect(result.databookPages).toBeNull();
  expect(result.mangaVolumes).toBeNull();
});
test("real zero stays zero and malformed counters never become public numbers", async () => {
  process.env.SHENRON_HOST_URL = server.url.origin;
  row = {
    canonReferences: "0",
    databookPages: "42",
    mangaPages: -1,
    mangaVolumes: null,
    mangaChapters: "garbage",
    episodes: 7,
    characters: 8,
  };
  const result = await getPublicCorpusStats();
  expect(result.canonReferences).toBe(0);
  expect(result.databookPages).toBe(42);
  expect(result.mangaPages).toBeNull();
  expect(result.mangaVolumes).toBeNull();
  expect(result.mangaChapters).toBeNull();
});
process.on("beforeExit", () => server.stop(true));
