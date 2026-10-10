import { describe, expect, it } from "bun:test";
import { readerAssetUrl } from "../src/lib/reader-assets";

describe("same-origin reader scans", () => {
  it("serves database and already normalized assets directly", () => {
    for (const prefix of ["./", "", "/"]) {
      expect(readerAssetUrl(`${prefix}assets/manga/DB/regular/vol1/001.webp`)).toBe(
        "/assets/manga/DB/regular/vol1/001.webp",
      );
    }
  });
  it("removes owned CDN and API origins while preserving asset query strings", () => {
    for (const origin of ["https://cdn.dragonballfr.com", "https://bot.dragonballfr.com"]) {
      expect(readerAssetUrl(`${origin}/assets/wiki/databooks/scan.jpg?v=2`)).toBe(
        "/assets/wiki/databooks/scan.jpg?v=2",
      );
    }
    expect(readerAssetUrl("https://media.example/assets/scan.jpg", ["https://media.example"])).toBe(
      "/assets/scan.jpg",
    );
  });
  it("preserves unrelated remote sources and non-asset endpoints", () => {
    for (const url of [
      "https://example.com/assets/scan.jpg",
      "https://bot.dragonballfr.com/api/manga/1",
      "/wiki/scan.jpg",
    ]) {
      expect(readerAssetUrl(url)).toBe(url);
    }
  });
});
