// SPDX-License-Identifier: Apache-2.0
import "server-only";
import {
  mangaPublicationRoot,
  validateMangaCdnChapter,
  validateMangaCdnIndex,
  type MangaCdnIndex,
} from "./manga-cdn-contract";

const digest = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
async function readJson(
  fetcher: typeof fetch,
  url: string,
  expectedSha256: string,
  limit = 2 * 1024 * 1024,
) {
  const response = await fetcher(url, {
    cache: "no-store",
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`Manga CDN unavailable (${response.status})`);
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw Error("Manga CDN object exceeds bound");
  }
  const reader = response.body!.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error("Manga CDN object exceeds bound");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || digest(bytes) !== expectedSha256)
    throw Error("Manga CDN object SHA256 differs");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Only a published, independently qualified index pin activates this reader. */
export function createMangaCdnSource(
  indexUrl: string,
  indexSha256: string,
  fetcher: typeof fetch = fetch,
) {
  mangaPublicationRoot(indexUrl);
  let cachedIndex: Promise<MangaCdnIndex> | undefined;
  const index = () =>
    (cachedIndex ??= readJson(fetcher, indexUrl, indexSha256)
      .then((value) => validateMangaCdnIndex(value, indexUrl))
      .catch((error) => {
        cachedIndex = undefined;
        throw error;
      }));
  const chapters = new Map<number, Promise<ReturnType<typeof validateMangaCdnChapter> | null>>();
  const chapter = async (id: number) => {
    const catalogue = await index(),
      descriptor = catalogue.chapters.find((row) => row.id === id);
    if (!descriptor) return null;
    if (!chapters.has(id))
      chapters.set(
        id,
        readJson(fetcher, descriptor.url, descriptor.sha256, 16 * 1024 * 1024)
          .then((value) => validateMangaCdnChapter(value, descriptor, indexUrl))
          .catch((error) => {
            chapters.delete(id);
            throw error;
          }),
      );
    return chapters.get(id)!;
  };
  return {
    async mangaCatalogVolumes() {
      return { volumes: (await index()).volumes };
    },
    async mangaVolumes(series = "DB") {
      return {
        volumes: (await index()).volumes
          .filter((volume) => volume.series === series)
          .toSorted((a, b) => a.volume_number - b.volume_number || a.id - b.id),
      };
    },
    async readableMangaChapters() {
      return {
        chapters: (await index()).chapters.map(
          ({
            id,
            series,
            chapter_number,
            title,
            volume_id,
            cover,
            previewPages,
            page_count,
            reader_extent,
          }) => ({
            id,
            series,
            chapter_number,
            title,
            volume_id,
            cover,
            pages: previewPages,
            page_count,
            reader_extent,
          }),
        ),
      };
    },
    async mangaVolume(id: number) {
      const catalogue = await index(),
        volume = catalogue.volumes.find((row) => row.id === id);
      if (!volume) return null;
      return {
        ...volume,
        chapters: (await Promise.all(catalogue.volumeChapters[String(id)]!.map(chapter))).filter(
          (row) => row !== null,
        ),
      };
    },
    async mangaChapter(id: number) {
      const catalogue = await index(),
        current = await chapter(id);
      if (!current) return null;
      const ordered = catalogue.chapters
          .filter((row) => row.series === current.series)
          .toSorted((a, b) => a.chapter_number - b.chapter_number || a.id - b.id),
        at = ordered.findIndex((row) => row.id === id);
      const prev = ordered[at - 1]?.id ?? null,
        next = ordered[at + 1]?.id ?? null;
      return {
        ...current,
        prev,
        next,
        prevPages: prev ? (await chapter(prev))!.pages : [],
        nextPages: next ? (await chapter(next))!.pages : [],
      };
    },
  };
}

/** A failed qualified projection explicitly delegates to its existing editorial owner. */
export async function mangaCdnWithFallback<T>(
  read: () => Promise<T>,
  editorial: () => Promise<T>,
): Promise<T> {
  try {
    const result = await read();
    return result === null ? editorial() : result;
  } catch {
    return editorial();
  }
}
