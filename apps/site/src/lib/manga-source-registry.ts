/**
 * Official bibliographic sources for manga records that are metadata-only.
 *
 * The authoritative values live in the bot manifest used to seed the records.
 * Importing that manifest avoids a second hand-maintained URL list in the site.
 */
import spinOffManifest from "../../../bot/data/manga-spin-offs-manifest.json";
import bibliographyManifest from "../../../bot/data/manga-bibliography-manifest.json";
import { isbnVariants } from "./catalog-media-contracts";

type SpinOffSource = {
  series: string;
  source_url: string;
  isbn?: string;
  publisher?: string;
};

const sourcesBySeries = new Map(
  (spinOffManifest.works as SpinOffSource[]).map((work) => [work.series, work.source_url]),
);

/** Bibliographic catalogue pages crawled for legacy editions; never reader assets. */
const catalogueSourcesBySeries = new Map([
  ["DBKZ", "https://comic.dragonballcn.com/dragonball_jp_kanzenban.htm"],
  ["DBZ_ANIME_COMICS", "https://comic.dragonballcn.com/dragonball_anime_z.htm"],
  ["DB_MOVIES", "https://comic.dragonballcn.com/dragonball_anime_movie.htm"],
  ["DBJP", "https://comic.dragonballcn.com/dragonball_jp_original.htm"],
  ["ARALE", "https://comic.dragonballcn.com/arale_cn.htm"],
]);

/** Primary publisher page when the catalogue record has one. */
export function officialMangaSourceUrl(series: string): string | null {
  return sourcesBySeries.get(series) ?? null;
}

/** Publisher record when possible, otherwise the crawled bibliographic catalogue. */
export function mangaBibliographicSourceUrl(series: string): string | null {
  return officialMangaSourceUrl(series) ?? catalogueSourcesBySeries.get(series) ?? null;
}

export function mangaSourceLabel(series: string): string | null {
  if (officialMangaSourceUrl(series)) return "Éditeur Shueisha";
  if (catalogueSourcesBySeries.has(series)) return "Catalogue bibliographique";
  return null;
}

/** A series reference alone cannot identify a volume's publication or language. */
export function mangaVolumeBibliographicSource(row: {
  id: number;
  isbn: string | null;
  title: string | null;
}): { url: string; label: string; language: string | null } | null {
  const variants = row.isbn ? isbnVariants(row.isbn) : [];
  const matches = bibliographyManifest.records.filter((record) => {
    if (variants.length > 0 && record.isbn) {
      return isbnVariants(record.isbn).some((key) => variants.includes(key));
    }
    return (
      !row.isbn &&
      !record.isbn &&
      record.jdcn !== null &&
      record.legacyVolumeId === row.id &&
      record.title === row.title
    );
  });
  if (matches.length === 0 && variants.length > 0) {
    const legacy = (spinOffManifest.works as SpinOffSource[]).filter(
      (record) => record.isbn && isbnVariants(record.isbn).some((key) => variants.includes(key)),
    );
    if (legacy.length === 1 && legacy[0]!.publisher) {
      return { url: legacy[0]!.source_url, label: legacy[0]!.publisher, language: null };
    }
  }
  if (matches.length !== 1) return null;
  const record = matches[0]!;
  return { url: record.sourceUrl, label: record.publisher, language: record.language };
}
