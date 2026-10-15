// SPDX-License-Identifier: Apache-2.0
export const MANGA_LIBRARY_PAGE_SIZE = 12;

export interface LibraryVolume {
  id: number;
  series: string;
  volumeNumber: number;
  title: string | null;
  cover: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

export interface LibraryChapter {
  id: number;
  chapter_number: number;
  title: string | null;
  series: string;
  cover: string | null;
  pages?: string[] | null;
  volume_id?: number | null;
}

/** Legacy imports use DB_SOSH for the same Sōshūhen collection. */
export function canonicalMangaCollection(series: string): string {
  return series === "DB_SOSH" ? "SOSH" : series;
}

export function uniqueLibraryVolumes(groups: readonly LibraryVolume[][]): LibraryVolume[] {
  const volumes = [...new Map(groups.flat().map((volume) => [volume.id, volume])).values()];
  const collections = [
    ...new Set(volumes.map((volume) => canonicalMangaCollection(volume.series))),
  ];
  return volumes.toSorted(
    (a, b) =>
      collections.indexOf(canonicalMangaCollection(a.series)) -
        collections.indexOf(canonicalMangaCollection(b.series)) ||
      a.volumeNumber - b.volumeNumber ||
      a.id - b.id,
  );
}

const fold = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function matchesLibrarySearch(title: string | null, number: number, query: string): boolean {
  const value = fold(query.trim());
  if (!value) return true;
  if (/^\d+$/.test(value)) return number === Number(value);
  return fold(title ?? "").includes(value);
}

/** Every collection and search has the same global rendering bound. */
export function mangaLibraryPage<T>(items: readonly T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / MANGA_LIBRARY_PAGE_SIZE));
  const page = Math.min(
    pages,
    Math.max(1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1),
  );
  const offset = (page - 1) * MANGA_LIBRARY_PAGE_SIZE;
  return {
    items: items.slice(offset, offset + MANGA_LIBRARY_PAGE_SIZE),
    page,
    pages,
    total: items.length,
    start: items.length ? offset + 1 : 0,
    end: Math.min(items.length, offset + MANGA_LIBRARY_PAGE_SIZE),
  };
}
