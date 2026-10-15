// SPDX-License-Identifier: Apache-2.0
import type { MangaReaderExtent } from "./manga-reader-extent";

export interface MangaReaderChainItem {
  series: string;
  volume_id?: number | null;
  reader_extent?: MangaReaderExtent | null;
}

/** An official excerpt is a separate reader chain, never a continuation of a full chapter. */
export function sameMangaReaderChain(
  current: MangaReaderChainItem,
  candidate: MangaReaderChainItem,
) {
  if (current.series !== candidate.series) return false;
  const preview = current.reader_extent?.kind === "preview";
  if (!preview) return candidate.reader_extent?.kind !== "preview";
  return (
    candidate.reader_extent?.kind === "preview" &&
    current.volume_id != null &&
    current.volume_id === candidate.volume_id &&
    Boolean(current.reader_extent?.sourceUrl) &&
    current.reader_extent?.sourceUrl === candidate.reader_extent.sourceUrl
  );
}
