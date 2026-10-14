// SPDX-License-Identifier: Apache-2.0
import { retainedMangaCdnImageUrl } from "./manga-cdn-contract";
import { readerAssetUrl } from "./reader-assets";
import { API_ORIGIN, CDN_ORIGIN, SITE_URL } from "./config";

/** Editorial reads retain fresh same-origin assets; verified CDN projections keep their published scans. */
export function mangaReaderAssetUrl(url: string, sourceKind?: "cdn" | "editorial"): string {
  return (
    (sourceKind === "cdn" ? retainedMangaCdnImageUrl(url) : null) ??
    readerAssetUrl(url, [CDN_ORIGIN, API_ORIGIN, SITE_URL])
  );
}
