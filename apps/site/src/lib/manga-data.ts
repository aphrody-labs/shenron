// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { cache } from "react";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { dbUniverse } from "./db-universe";
import { createMangaCdnSource, mangaCdnWithFallback } from "./manga-cdn-source";
import {
  mangaVolumeBibliographicRecord,
  mangaVolumeBibliographicSource,
} from "./manga-source-registry";

export const MANGA_CATALOGUE_INDEX_URL = `${DEFAULT_PUBLIC_ORIGINS.cdn}/publications/manga-catalogue/index.json`;
type EditorialManga = Pick<
  typeof dbUniverse,
  "mangaCatalogVolumes" | "mangaVolumes" | "readableMangaChapters" | "mangaVolume" | "mangaChapter"
> &
  Partial<Pick<typeof dbUniverse, "mangaVolumeCovers">>;
type Source = ReturnType<typeof createMangaCdnSource>;
type TaggedRead<K extends "mangaVolume" | "mangaChapter"> =
  | (NonNullable<Awaited<ReturnType<EditorialManga[K]>>> & { sourceKind: "cdn" | "editorial" })
  | null;
const lifetime = 30000;

function withBibliography<T extends { id: number; isbn?: string | null; title: string | null }>(
  volume: T,
): T {
  const source = mangaVolumeBibliographicSource({ ...volume, isbn: volume.isbn ?? null });
  return source ? { ...volume, source_url: source.url, source_label: source.label } : volume;
}

/** An owned, uncached digest header binds each short-lived reader to its exact index bytes. */
export function createMangaData(
  editorial: EditorialManga,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  // React deduplicates this lightweight editorial query within one render only.
  const editorialCovers = cache(async () => editorial.mangaVolumeCovers?.());
  const withEditorialCovers = async <
    T extends { id: number; cover: string | null; isbn?: string | null; title: string | null },
  >(
    volumes: T[],
  ) => {
    const publication = (volume: T) =>
      mangaVolumeBibliographicRecord({ ...volume, isbn: volume.isbn ?? null });
    const safeVolumes = volumes.map((volume) =>
      publication(volume) && /(?:^|\/)assets\/dragonballcn\//.test(volume.cover ?? "")
        ? { ...volume, cover: null }
        : volume,
    );
    if (!editorial.mangaVolumeCovers) return safeVolumes;
    try {
      const rows = await editorialCovers();
      const covers = new Map((rows ?? []).map((row) => [row.id, row.cover?.trim() || null]));
      return safeVolumes.map((volume) => {
        if (!covers.has(volume.id)) return volume;
        const cover = covers.get(volume.id);
        return cover || publication(volume) ? { ...volume, cover: cover ?? null } : volume;
      });
    } catch {
      // An unavailable editorial overlay must never interrupt qualified CDN scans.
      return safeVolumes;
    }
  };
  let current: { expires: number; source: Promise<Source> } | undefined;
  const source = (expectedSha256?: string) => {
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
      if (expectedSha256 && sha !== expectedSha256)
        throw Error("Manga publication digest differs from revalidation request");
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
    refreshPublication: (expectedSha256: string) => {
      if (!/^[a-f0-9]{64}$/.test(expectedSha256))
        throw Error("Qualified manga publication digest required");
      current = undefined;
      return source(expectedSha256);
    },
    mangaCatalogVolumes: async () => {
      const result = await mangaCdnWithFallback(
        async () => (await source()).mangaCatalogVolumes(),
        () => editorial.mangaCatalogVolumes(),
      );
      return result
        ? { ...result, volumes: (await withEditorialCovers(result.volumes)).map(withBibliography) }
        : null;
    },
    mangaVolumes: async (series = "DB") => {
      const result = await mangaCdnWithFallback(
        async () => (await source()).mangaVolumes(series),
        () => editorial.mangaVolumes(series),
      );
      return result
        ? { ...result, volumes: (await withEditorialCovers(result.volumes)).map(withBibliography) }
        : null;
    },
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
          return result
            ? {
                ...withBibliography((await withEditorialCovers([result]))[0]!),
                sourceKind: "cdn" as const,
              }
            : null;
        },
        async () => {
          const result = await editorial.mangaVolume(id);
          return result ? { ...withBibliography(result), sourceKind: "editorial" as const } : null;
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
/** A runtime publication hook bypasses this process's thirty-second source cache. */
export const refreshMangaPublication = shared.refreshPublication;
/** React deduplicates metadata and page reads within a render; the shared publication expires separately. */
export const mangaData = {
  mangaCatalogVolumes: cache(shared.mangaCatalogVolumes),
  mangaVolumes: cache(shared.mangaVolumes),
  readableMangaChapters: cache(shared.readableMangaChapters),
  mangaVolume: cache(shared.mangaVolume),
  mangaChapter: cache(shared.mangaChapter),
};
