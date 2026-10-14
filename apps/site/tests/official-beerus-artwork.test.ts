import { expect, test } from "bun:test";
import {
  OFFICIAL_BEERUS_ARTWORK,
  officialBeerusArtwork,
  officialWatchArtwork,
} from "../src/lib/official-beerus-artwork";

test("the official artwork projection exposes the complete immutable public inventory", () => {
  expect(OFFICIAL_BEERUS_ARTWORK).toHaveLength(27);
  expect(new Set(OFFICIAL_BEERUS_ARTWORK.map((asset) => asset.id)).size).toBe(27);
  expect(new Set(OFFICIAL_BEERUS_ARTWORK.map((asset) => asset.sha256)).size).toBe(27);
  for (const asset of OFFICIAL_BEERUS_ARTWORK) {
    const url = new URL(asset.src);
    expect(url.origin).toBe("https://cdn.dragonballfr.com");
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(url.pathname).toMatch(
      new RegExp(`^/dragonball-super/${asset.sha256}\\.(webp|png|jpg|svg|ico)$`),
    );
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(asset.width).toBeGreaterThan(0);
    expect(asset.height).toBeGreaterThan(0);
    expect(asset.bytes).toBeGreaterThan(0);
  }
});

test("attribution remains on actual first-party public asset paths", () => {
  for (const asset of OFFICIAL_BEERUS_ARTWORK) {
    const origin = new URL(asset.sourceUrl);
    expect(origin.origin).toBe("https://dragonball-super.com");
    expect(origin.pathname.startsWith("/img/")).toBe(true);
    expect(new URL(asset.sourcePage).origin).toBe(origin.origin);
    expect(origin.username).toBe("");
    expect(origin.password).toBe("");
  }
  expect(officialBeerusArtwork("mega-shinnosuke-portrait").role).toBe("artist");
  expect(officialBeerusArtwork("goku-portrait").role).toBe("character");
  expect(officialBeerusArtwork("logo-en").width).toBe(1233);
  expect(officialBeerusArtwork("key-visual").height).toBe(3950);
});

test("official series decoration cannot replace other works' record-specific imagery", () => {
  expect(officialWatchArtwork("DBS_BEERUS")?.id).toBe("introduction-space");
  for (const series of [undefined, null, "DBS", "DBZ", "DBS_MOVIE", "DB_DAIMA"]) {
    expect(officialWatchArtwork(series)).toBeNull();
  }
});
