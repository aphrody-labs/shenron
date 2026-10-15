// SPDX-License-Identifier: Apache-2.0
import type { MangaReaderExtent } from "@aphrody/shenron-db/bot-schema";
export type { MangaReaderExtent } from "@aphrody/shenron-db/bot-schema";

export function isMangaReaderExtent(value: unknown): value is MangaReaderExtent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (
    !Object.keys(row).every((key) => ["kind", "sourceUrl", "fullVolumePages"].includes(key)) ||
    !["preview", "full", "unknown"].includes(String(row.kind))
  )
    return false;
  if (row.sourceUrl !== undefined) {
    if (typeof row.sourceUrl !== "string") return false;
    try {
      const url = new URL(row.sourceUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
    } catch {
      return false;
    }
  }
  return (
    row.fullVolumePages === undefined ||
    row.fullVolumePages === null ||
    (typeof row.fullVolumePages === "number" &&
      Number.isSafeInteger(row.fullVolumePages) &&
      row.fullVolumePages > 0 &&
      row.fullVolumePages <= 100000)
  );
}
/** Missing legacy metadata never establishes a complete edition. */
export function mangaReaderExtent(value: unknown): MangaReaderExtent {
  if (!isMangaReaderExtent(value)) return { kind: "unknown" };
  return {
    kind: value.kind,
    ...(value.sourceUrl ? { sourceUrl: value.sourceUrl } : {}),
    ...(value.fullVolumePages !== undefined ? { fullVolumePages: value.fullVolumePages } : {}),
  };
}
