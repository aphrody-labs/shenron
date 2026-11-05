import { describe, expect, test } from "bun:test";
import { officialCrunchyrollWatchURL } from "../src/video-providers";

describe("officialCrunchyrollWatchURL", () => {
  test("accepts official public watch pages, including localized routes", () => {
    expect(officialCrunchyrollWatchURL("https://www.crunchyroll.com/watch/GX9UQH/episode-1")).toBe(
      "https://www.crunchyroll.com/watch/GX9UQH/episode-1",
    );
    expect(officialCrunchyrollWatchURL("https://crunchyroll.com/fr-fr/watch/GX9UQH")).toBe(
      "https://crunchyroll.com/fr-fr/watch/GX9UQH",
    );
  });

  test("rejects private or unrelated URLs", () => {
    for (const value of [
      "https://www.crunchyroll.com/watch/GX9UQH?token=secret",
      "https://www.crunchyroll.com/watch/GX9UQH#fragment",
      "https://user:pass@www.crunchyroll.com/watch/GX9UQH",
      "https://www.crunchyroll.com:8443/watch/GX9UQH",
      "http://www.crunchyroll.com/watch/GX9UQH",
      "https://crunchyroll.com.evil.test/watch/GX9UQH",
      "https://www.crunchyroll.com/series/GX9UQH",
      "not a url",
    ]) {
      expect(officialCrunchyrollWatchURL(value)).toBeNull();
    }
  });
});
