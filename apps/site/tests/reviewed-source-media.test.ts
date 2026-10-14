// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { REVIEWED_SOURCE_MEDIA, reviewedSourceMediaUrl } from "../src/lib/reviewed-source-media";
import { publicDatabookImage } from "../src/lib/databook-media";
import { readerAssetUrl } from "../src/lib/reader-assets";

test("the nine exact reviewed source images resolve to their immutable CDN identity for covers and readers", () => {
  expect(REVIEWED_SOURCE_MEDIA).toHaveLength(9);
  expect(new Set(REVIEWED_SOURCE_MEDIA.map((entry) => entry.sourceUrl)).size).toBe(9);
  for (const media of REVIEWED_SOURCE_MEDIA) {
    expect(media.publishedUrl).toContain(`/objects/${media.sha256}.png`);
    expect(media.bytes).toBeGreaterThan(0);
    expect(reviewedSourceMediaUrl(media.sourceUrl)).toBe(media.publishedUrl);
    expect(publicDatabookImage(media.sourceUrl)).toBe(media.publishedUrl);
    expect(readerAssetUrl(media.sourceUrl)).toBe(media.publishedUrl);
    expect(readerAssetUrl(media.publishedUrl)).toBe(media.publishedUrl);
  }
});

test("the source registry does not guess other images, variants, hosts or editions", () => {
  for (const source of [
    `${REVIEWED_SOURCE_MEDIA[0].sourceUrl}?variant=other`,
    REVIEWED_SOURCE_MEDIA[0].sourceUrl.replace("img_01", "img_10"),
    REVIEWED_SOURCE_MEDIA[0].sourceUrl.replace("www.carddass.com", "example.com"),
    "https://example.com/image.png",
  ]) {
    expect(reviewedSourceMediaUrl(source)).toBeNull();
    expect(readerAssetUrl(source)).toBe(source);
    expect(publicDatabookImage(source)).toBe(source);
  }
  expect(publicDatabookImage("javascript:private")).toBeNull();
});
