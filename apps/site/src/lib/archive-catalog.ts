// SPDX-License-Identifier: Apache-2.0
import selection from "./archive-selection.json";
export const ARCHIVE_CATEGORIES = ["archive_movies", "archive_images"] as const;
export type ArchiveCategory = (typeof ARCHIVE_CATEGORIES)[number];
export type ArchiveEntry = {
  category: ArchiveCategory;
  url: string;
  recordTitle: string;
  title: string;
  series: string;
  language: string;
  declaredLanguage: string;
  mediaType: "movies" | "image";
  mediaFile: string;
  mediaBytes: number;
  mediaMime: string;
  mediaUrl: string;
  preview: string | null;
  checkedAt: string;
  metadataSha256: string;
};
export type ArchiveFilters = { mediaLang?: string; series?: string };
export function isArchiveCategory(category: string): category is ArchiveCategory {
  return ARCHIVE_CATEGORIES.some((value) => value === category);
}
export const archiveEntries = selection.entries as ArchiveEntry[];
export function archiveOptions(category: string) {
  const entries = archiveEntries.filter((item) => item.category === category);
  return {
    languages: [...new Set(entries.map((item) => item.language))].toSorted(),
    series: [...new Set(entries.map((item) => item.series))].toSorted(),
  };
}
export function selectArchiveEntries(category: string, filters: ArchiveFilters = {}) {
  return archiveEntries.filter(
    (item) =>
      item.category === category &&
      (!filters.mediaLang || item.language === filters.mediaLang) &&
      (!filters.series || item.series === filters.series),
  );
}
export function selectedArchiveEntry(category: string, url: string, title: string) {
  return archiveEntries.find(
    (item) => item.category === category && item.url === url && item.recordTitle === title,
  );
}
export const archiveSelectionObservedAt = selection.observedAt;
