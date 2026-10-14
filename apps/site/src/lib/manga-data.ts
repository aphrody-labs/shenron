// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { cache } from "react";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { dbUniverse } from "./db-universe";
import { createMangaCdnSource, mangaCdnWithFallback } from "./manga-cdn-source";

export const MANGA_CATALOGUE_INDEX_URL = `${DEFAULT_PUBLIC_ORIGINS.cdn}/publications/manga-catalogue/index.json`;
type EditorialManga = Pick<
  typeof dbUniverse,
  "mangaCatalogVolumes" | "mangaVolumes" | "readableMangaChapters" | "mangaVolume" | "mangaChapter"
>;
type Source = ReturnType<typeof createMangaCdnSource>;
type TaggedRead<K extends "mangaVolume" | "mangaChapter"> =
  | (NonNullable<Awaited<ReturnType<EditorialManga[K]>>> & { sourceKind: "cdn" | "editorial" })
  | null;
const lifetime = 30000;

/** An owned, uncached digest header binds each short-lived reader to its exact index bytes. */
export function createMangaData(
  editorial: EditorialManga,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  let current: { expires: number; source: Promise<Source> } | undefined;
  const source = () => {
    if (current && now() < current.expires) return current.source;
    const pending = (async () => {
      const response = await fetcher(MANGA_CATALOGUE_INDEX_URL, {
        method: "HEAD",
        cache: "no-store",
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
      });
      const sha = response.headers.get("x-content-sha256"),
        length = response.headers.get("content-length");
      if (
        response.status !== 200 ||
        response.url !== MANGA_CATALOGUE_INDEX_URL ||
        !sha ||
        !/^[a-f0-9]{64}$/.test(sha) ||
        !response.headers
          .get("cache-control")
          ?.split(",")
          .some((value) => value.trim().toLowerCase() === "no-store") ||
        response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
          "application/json" ||
        (length !== null &&
          (!/^\d+$/.test(length) || Number(length) < 1 || Number(length) > 2 * 1024 * 1024))
      )
        throw Error("Unqualified manga catalogue header");
      const qualified = createMangaCdnSource(MANGA_CATALOGUE_INDEX_URL, sha, fetcher);
      await qualified.mangaCatalogVolumes();
      return qualified;
    })();
    const entry = { expires: now() + lifetime, source: pending };
    current = entry;
    void pending.catch(() => {
      if (current === entry) current = undefined;
    });
    return pending;
  };
  return {
    mangaCatalogVolumes: () =>
      mangaCdnWithFallback(
        async () => (await source()).mangaCatalogVolumes(),
        () => editorial.mangaCatalogVolumes(),
      ),
    mangaVolumes: (series = "DB") =>
      mangaCdnWithFallback(
        async () => (await source()).mangaVolumes(series),
        () => editorial.mangaVolumes(series),
      ),
    readableMangaChapters: (series?: string) =>
      mangaCdnWithFallback(
        async () => {
          const result = await (await source()).readableMangaChapters();
          return {
            chapters: series
              ? result.chapters.filter((row) => row.series === series)
              : result.chapters,
          };
        },
        () => editorial.readableMangaChapters(series),
      ),
    mangaVolume: (id: number) =>
      mangaCdnWithFallback<TaggedRead<"mangaVolume">>(
        async () => {
          const result = await (await source()).mangaVolume(id);
          return result ? { ...result, sourceKind: "cdn" as const } : null;
        },
        async () => {
          const result = await editorial.mangaVolume(id);
          return result ? { ...result, sourceKind: "editorial" as const } : null;
        },
      ),
    mangaChapter: (id: number) =>
      mangaCdnWithFallback<TaggedRead<"mangaChapter">>(
        async () => {
          const result = await (await source()).mangaChapter(id);
          return result ? { ...result, sourceKind: "cdn" as const } : null;
        },
        async () => {
          const result = await editorial.mangaChapter(id);
          return result ? { ...result, sourceKind: "editorial" as const } : null;
        },
      ),
  };
}

const shared = createMangaData(dbUniverse);
/** React deduplicates metadata and page reads within a render; the shared publication expires separately. */
export const mangaData = {
  mangaCatalogVolumes: cache(shared.mangaCatalogVolumes),
  mangaVolumes: cache(shared.mangaVolumes),
  readableMangaChapters: cache(shared.readableMangaChapters),
  mangaVolume: cache(shared.mangaVolume),
  mangaChapter: cache(shared.mangaChapter),
};
