// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
mock.module("../src/lib/db-universe", () => ({ dbUniverse: {} }));
const { createMangaData, MANGA_CATALOGUE_INDEX_URL } = await import("../src/lib/manga-data");
import { projectMangaCdn, mangaDigest } from "../../../scripts/ops/manga-cdn-projection";
import { mangaReaderAssetUrl } from "../src/lib/manga-reader-assets";

function projection(title = "Goku", isbn: string | null = null) {
  return projectMangaCdn(
    {
      observedAt: "2026-10-14T16:00:00.000Z",
      declaredSeries: [{ series: "DB", chapters: 2, pages: 8 }],
      volumes: [
        {
          id: 1,
          series: "DB",
          volume_number: 1,
          title,
          isbn,
          cover: null,
          chapters: [{ id: 10 }, { id: 11 }],
        },
      ],
      chapters: [10, 11].map((id, offset) => ({
        id,
        series: "DB",
        chapter_number: offset + 1,
        volume_id: 1,
        title,
        pages: 4,
        pageList: Array.from({ length: 4 }, () => ({ image: "./assets/manga/DB/page.webp" })),
      })),
    },
    {
      "/assets/manga/DB/page.webp": {
        sha256: mangaDigest("qualified scan"),
        size: 20,
        contentType: "image/webp",
      },
    },
    "a".repeat(64),
    MANGA_CATALOGUE_INDEX_URL,
  );
}
function editorial() {
  const calls: string[] = [];
  const chapter = {
    id: 99,
    series: "DB",
    chapter_number: 99,
    title: "Fresh",
    volume_id: 99,
    cover: null,
    pages: ["/assets/manga/fresh.webp"],
  };
  const volume = {
    id: 99,
    series: "DB",
    volume_number: 99,
    title: "Fresh",
    cover: null,
    chapters: [chapter],
  };
  const port: Parameters<typeof createMangaData>[0] = {
    mangaCatalogVolumes: async () => {
      calls.push("catalogue");
      return { volumes: [volume] };
    },
    mangaVolumes: async (series) => {
      calls.push(`volumes:${series}`);
      return { volumes: [volume] };
    },
    readableMangaChapters: async (series) => {
      calls.push(`chapters:${series}`);
      return { chapters: [{ ...chapter, page_count: 1 }] };
    },
    mangaVolume: async (id) => {
      calls.push(`volume:${id}`);
      return volume;
    },
    mangaChapter: async (id) => {
      calls.push(`chapter:${id}`);
      return { ...chapter, prev: null, next: null, prevPages: [], nextPages: [] };
    },
  };
  return { port, calls };
}
function transport(isbn: string | null = null) {
  let current = projection("Goku", isbn);
  let failure: "head" | "digest" | "uri" | "size" | "cache" | "schema" | "stream" | "sha" | null =
    null;
  const calls: string[] = [];
  const fetcher = Object.assign(
    async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
      const url = String(input);
      calls.push(`${options?.method ?? "GET"}:${url}`);
      expect(options?.cache).toBe("no-store");
      expect(options?.credentials).toBe("omit");
      expect(options?.redirect).toBe("error");
      expect(new URL(url).origin).toBe("https://cdn.dragonballfr.com");
      if (options?.method === "HEAD") {
        const response = new Response(null, {
          status: failure === "head" ? 404 : 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": failure === "cache" ? "public,max-age=60" : "no-store",
            "x-content-sha256":
              failure === "sha"
                ? "INVALID"
                : failure === "digest"
                  ? "b".repeat(64)
                  : failure === "schema"
                    ? mangaDigest("{}")
                    : current.indexSha256,
            "content-length":
              failure === "size"
                ? String(2 * 1024 * 1024 + 1)
                : String(current.artifacts.get(new URL(url).pathname)!.length),
          },
        });
        Object.defineProperty(response, "url", {
          value: failure === "uri" ? "https://foreign.test/index.json" : url,
        });
        return response;
      }
      return new Response(
        failure === "stream"
          ? "x".repeat(2 * 1024 * 1024 + 1)
          : failure === "schema"
            ? "{}"
            : current.artifacts.get(new URL(url).pathname),
      );
    },
    { preconnect: fetch.preconnect },
  );
  return {
    fetcher,
    calls,
    fail: (value: typeof failure) => {
      failure = value;
    },
    publish: (title: string) => {
      current = projection(title, isbn);
    },
  };
}

test("one bounded publication supplies hub previews, complete volume and adjacent reader pages", async () => {
  const network = transport(),
    fallback = editorial(),
    data = createMangaData(fallback.port, network.fetcher);
  const [catalogue, volumes, previews] = await Promise.all([
    data.mangaCatalogVolumes(),
    data.mangaVolumes("DB"),
    data.readableMangaChapters("DB"),
  ]);
  expect(catalogue?.volumes[0]?.title).toBe("Goku");
  expect(volumes?.volumes).toHaveLength(1);
  expect(previews?.chapters[0]?.pages).toHaveLength(3);
  expect(previews?.chapters[0]?.page_count).toBe(4);
  expect((await data.readableMangaChapters("DBS"))?.chapters).toEqual([]);
  const volume = await data.mangaVolume(1),
    chapter = await data.mangaChapter(10);
  expect(volume?.sourceKind).toBe("cdn");
  expect(volume?.chapters).toHaveLength(2);
  expect(volume?.chapters[0]?.pages).toHaveLength(4);
  expect(chapter?.sourceKind).toBe("cdn");
  expect(chapter?.next).toBe(11);
  expect(chapter?.nextPages).toHaveLength(4);
  expect(chapter?.prev).toBeNull();
  expect(network.calls.filter((value) => value.startsWith("HEAD:"))).toHaveLength(1);
  expect(fallback.calls).toEqual([]);
  expect((await data.mangaChapter(999))?.sourceKind).toBe("editorial");
  expect((await data.mangaVolume(999))?.sourceKind).toBe("editorial");
  expect(fallback.calls).toEqual(["chapter:999", "volume:999"]);
});

test("a new live digest replaces the shared source after thirty seconds without a code pin", async () => {
  let time = 0;
  const network = transport(),
    data = createMangaData(editorial().port, network.fetcher, () => time);
  expect((await data.mangaChapter(10))?.title).toBe("Goku");
  network.publish("Gohan");
  time = 29999;
  expect((await data.mangaChapter(10))?.title).toBe("Goku");
  time = 30000;
  expect((await data.mangaChapter(10))?.title).toBe("Gohan");
  expect(network.calls.filter((value) => value.startsWith("HEAD:"))).toHaveLength(2);
});

test("verified ISBN bibliography enriches the CDN hub and detail without replacing reader assets", async () => {
  const network = transport("978-4-08-111166-4"),
    fallback = editorial(),
    data = createMangaData(fallback.port, network.fetcher);
  const source = "https://books.shueisha.co.jp/items/contents.html?isbn=978-4-08-111166-4";
  const [catalogue, volumes, volume] = await Promise.all([
    data.mangaCatalogVolumes(),
    data.mangaVolumes("DB"),
    data.mangaVolume(1),
  ]);
  expect(catalogue?.volumes[0]?.source_url).toBe(source);
  expect(volumes?.volumes[0]?.source_url).toBe(source);
  expect(volume?.source_url).toBe(source);
  expect(volume?.source_label).toBe("集英社");
  expect(volume?.sourceKind).toBe("cdn");
  expect(volume?.chapters[0]?.pages).toHaveLength(4);
  expect(volume?.chapters[0]?.pages?.[0]).toBe(
    "https://cdn.dragonballfr.com/assets/manga/DB/page.webp",
  );
  expect(fallback.calls).toEqual([]);
});

test("missing, foreign, oversized, cached or corrupt publication reads fall back and retry immediately", async () => {
  for (const failure of [
    "head",
    "digest",
    "uri",
    "size",
    "cache",
    "schema",
    "stream",
    "sha",
  ] as const) {
    const network = transport(),
      fallback = editorial(),
      data = createMangaData(fallback.port, network.fetcher);
    network.fail(failure);
    expect((await data.mangaChapter(10))?.title).toBe("Fresh");
    expect(fallback.calls).toEqual(["chapter:10"]);
    network.fail(null);
    expect((await data.mangaChapter(10))?.title).toBe("Goku");
    expect(network.calls.filter((value) => value.startsWith("HEAD:"))).toHaveLength(2);
  }
});

test("CDN scan resolution is explicit and rejects foreign or credential-bearing preservation", () => {
  const scan = "https://cdn.dragonballfr.com/assets/manga/DB/page.webp";
  expect(mangaReaderAssetUrl(scan, "cdn")).toBe(scan);
  expect(mangaReaderAssetUrl(scan, "editorial")).toBe("/assets/manga/DB/page.webp");
  expect(mangaReaderAssetUrl(scan)).toBe("/assets/manga/DB/page.webp");
  expect(
    mangaReaderAssetUrl(
      "https://user:secret@cdn.dragonballfr.com/assets/manga/DB/page.webp",
      "cdn",
    ),
  ).toBe("/assets/manga/DB/page.webp");
  expect(mangaReaderAssetUrl("https://foreign.test/assets/page.webp", "cdn")).toBe(
    "https://foreign.test/assets/page.webp",
  );
});
