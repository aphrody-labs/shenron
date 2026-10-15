// SPDX-License-Identifier: Apache-2.0
/** Public manga projection: metadata and licensed image references, never OCR or private fields. */
import {
  isMangaReaderExtent,
  mangaReaderExtent,
  type MangaReaderExtent,
} from "./manga-reader-extent";
export type CdnMangaVolume = {
  id: number;
  series: string;
  volume_number: number;
  title: string | null;
  cover: string | null;
  title_ja: string | null;
  published_at: number | null;
  isbn: string | null;
  source_url: string | null;
  source_label: string | null;
};
export type CdnMangaChapter = {
  reader_extent?: MangaReaderExtent | null;
  id: number;
  series: string;
  chapter_number: number;
  title: string | null;
  volume_id: number | null;
  cover: string | null;
  pages: string[];
};
export type CdnMangaDescriptor = Omit<CdnMangaChapter, "pages"> & {
  page_count: number;
  previewPages: string[];
  url: string;
  sha256: string;
};
export type MangaCdnIndex = {
  schema: "shenron-manga-cdn/v1";
  revision: string;
  observedAt: string;
  assetInventorySha256: string;
  volumes: CdnMangaVolume[];
  chapters: CdnMangaDescriptor[];
  volumeChapters: Record<string, number[]>;
};
const hex = /^[a-f0-9]{64}$/;
const id = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const integer = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown) =>
  value === null ||
  (typeof value === "string" &&
    value.length <= 10000 &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)),
    ));
export function mangaPublicationRoot(indexUrl: string): string {
  const url = new URL(indexUrl);
  if (
    url.origin !== "https://cdn.dragonballfr.com" ||
    url.search ||
    url.hash ||
    !/^\/publications\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.json$/.test(url.pathname)
  )
    throw Error("Invalid manga CDN publication identity");
  return url.href.slice(0, -"index.json".length);
}
function objectUrl(value: unknown, root: string, extension: string) {
  return (
    typeof value === "string" &&
    value.startsWith(root + "objects/") &&
    new RegExp(
      `^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}objects/[a-f0-9]{64}\\.(?:${extension})$`,
    ).test(value)
  );
}
function exactKeys(row: Record<string, unknown>, keys: string[]) {
  if (Object.keys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key)))
    throw Error("Manga CDN field allowlist differs");
}
const chapterKeys = ["id", "series", "chapter_number", "title", "volume_id", "cover"];
/** A qualified snapshot retains existing owned CDN image routes without rewriting foreign sources. */
export function retainedMangaCdnImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !URL.canParse(value)) return null;
  const url = new URL(value);
  if (
    url.origin !== "https://cdn.dragonballfr.com" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (
    path.includes("\\") ||
    Array.from(path).some((character) => character.charCodeAt(0) < 32) ||
    path.split("/").some((part) => part === "." || part === "..")
  )
    return null;
  return /^\/(?:assets\/|wiki\/|publications\/)/.test(path) ? value : null;
}
function chapterIdentity(row: Record<string, unknown>) {
  if (
    row.reader_extent !== undefined &&
    row.reader_extent !== null &&
    !isMangaReaderExtent(row.reader_extent)
  )
    throw Error("Invalid public reader extent");
  if (
    !id(row.id) ||
    typeof row.series !== "string" ||
    !/^[A-Z0-9_]+$/.test(row.series) ||
    !integer(row.chapter_number) ||
    !text(row.title) ||
    !(row.volume_id === null || id(row.volume_id)) ||
    !(row.cover === null || retainedMangaCdnImageUrl(row.cover))
  )
    throw Error("Invalid public manga chapter");
}
export function validateMangaCdnIndex(value: unknown, indexUrl: string): MangaCdnIndex {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid manga CDN index");
  const row = value as Record<string, unknown>,
    root = mangaPublicationRoot(indexUrl);
  exactKeys(row, [
    "schema",
    "revision",
    "observedAt",
    "assetInventorySha256",
    "volumes",
    "chapters",
    "volumeChapters",
  ]);
  if (
    row.schema !== "shenron-manga-cdn/v1" ||
    !hex.test(String(row.revision)) ||
    !hex.test(String(row.assetInventorySha256)) ||
    typeof row.observedAt !== "string" ||
    !Number.isFinite(Date.parse(row.observedAt)) ||
    !Array.isArray(row.volumes) ||
    row.volumes.length < 1 ||
    row.volumes.length > 10000 ||
    !Array.isArray(row.chapters) ||
    row.chapters.length < 1 ||
    row.chapters.length > 10000 ||
    !row.volumeChapters ||
    typeof row.volumeChapters !== "object" ||
    Array.isArray(row.volumeChapters)
  )
    throw Error("Invalid manga CDN catalogue bounds");
  const volumes = new Set<number>(),
    chapters = new Set<number>();
  for (const volume of row.volumes) {
    exactKeys(volume, [
      "id",
      "series",
      "volume_number",
      "title",
      "cover",
      "title_ja",
      "published_at",
      "isbn",
      "source_url",
      "source_label",
    ]);
    if (
      !id(volume.id) ||
      volumes.has(volume.id) ||
      typeof volume.series !== "string" ||
      !/^[A-Z0-9_]+$/.test(volume.series) ||
      !integer(volume.volume_number) ||
      ![volume.title, volume.title_ja, volume.isbn, volume.source_url, volume.source_label].every(
        text,
      ) ||
      !(volume.published_at === null || integer(volume.published_at)) ||
      !(volume.cover === null || retainedMangaCdnImageUrl(volume.cover))
    )
      throw Error("Invalid public manga volume");
    volumes.add(volume.id);
  }
  for (const chapter of row.chapters) {
    exactKeys(chapter, [
      ...chapterKeys,
      "page_count",
      "previewPages",
      "url",
      "sha256",
      ...(Object.hasOwn(chapter, "reader_extent") ? ["reader_extent"] : []),
    ]);
    chapterIdentity(chapter);
    if (
      chapters.has(chapter.id) ||
      !integer(chapter.page_count) ||
      chapter.page_count < 1 ||
      chapter.page_count > 100000 ||
      !Array.isArray(chapter.previewPages) ||
      chapter.previewPages.length !== Math.min(3, chapter.page_count) ||
      !chapter.previewPages.every((url: unknown) => retainedMangaCdnImageUrl(url)) ||
      !objectUrl(chapter.url, root, "json") ||
      !hex.test(chapter.sha256) ||
      !chapter.url.endsWith(`/objects/${chapter.sha256}.json`)
    )
      throw Error("Invalid manga chapter descriptor");
    chapters.add(chapter.id);
  }
  const links = row.volumeChapters as Record<string, unknown>;
  if (Object.keys(links).length !== volumes.size) throw Error("Incomplete volume chapter mapping");
  for (const [volume, ids] of Object.entries(links))
    if (
      !volumes.has(Number(volume)) ||
      !Array.isArray(ids) ||
      new Set(ids).size !== ids.length ||
      !ids.every((chapter) => chapters.has(chapter))
    )
      throw Error("Unknown or duplicated catalogue identity");
  return value as MangaCdnIndex;
}
export function validateMangaCdnChapter(
  value: unknown,
  descriptor: CdnMangaDescriptor,
  indexUrl: string,
): CdnMangaChapter {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid manga CDN chapter object");
  const row = value as Record<string, unknown>;
  mangaPublicationRoot(indexUrl);
  exactKeys(row, [
    ...chapterKeys,
    "pages",
    ...(Object.hasOwn(row, "reader_extent") ? ["reader_extent"] : []),
  ]);
  chapterIdentity(row);
  if (
    chapterKeys.some((key) => row[key] !== descriptor[key as keyof typeof descriptor]) ||
    JSON.stringify(mangaReaderExtent(row.reader_extent)) !==
      JSON.stringify(mangaReaderExtent(descriptor.reader_extent)) ||
    !Array.isArray(row.pages) ||
    row.pages.length !== descriptor.page_count ||
    !row.pages.every((url) => retainedMangaCdnImageUrl(url)) ||
    row.pages.slice(0, 3).some((url, index) => url !== descriptor.previewPages[index])
  )
    throw Error("Manga chapter object differs from its descriptor");
  return value as CdnMangaChapter;
}
