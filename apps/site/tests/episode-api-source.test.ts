import { describe, expect, mock, test } from "bun:test";
import type { Episode } from "../src/lib/db-universe";

mock.module("server-only", () => ({}));
mock.module("../src/lib/db-universe", () => ({}));

const { episodeApiSummary } = await import("../src/lib/episode-api");

function episode(official_source_url: string | null, id = 999_827): Episode {
  return {
    id,
    series: "SDBH",
    number_in_series: null,
    arc_id: null,
    title: "Episode test",
    title_ja: null,
    air_date: null,
    duration_sec: null,
    synopsis: null,
    official_source_url,
    image: null,
    video_url: null,
    mal_id: null,
    subtitles: [],
    players: [],
    availability: [],
    stream_url: null,
    frames: [],
    scene_preview: null,
  };
}

describe("episode API official source URL", () => {
  test("returns a separate public HTTPS source link", () => {
    expect(
      episodeApiSummary(episode("https://www.youtube.com/watch?v=abc")).officialSourceUrl,
    ).toBe("https://www.youtube.com/watch?v=abc");
  });

  test("does not expose insecure, credentialed, malformed, or absent source URLs", () => {
    for (const source of [
      "http://google.com/video",
      "javascript:alert(1)",
      "https://user:pass@google.com/video",
      "not a URL",
      null,
    ]) {
      expect(episodeApiSummary(episode(source)).officialSourceUrl).toBeNull();
    }
  });

  test("known SDBH episodes retain their safe official fallback when a source is rejected", () => {
    for (const source of [
      "http://google.com/video",
      "javascript:alert(1)",
      "https://user:pass@google.com/video",
      "not a URL",
      null,
    ]) {
      const summary = episodeApiSummary(episode(source, 827));
      expect(summary.officialSourceUrl).toBe("https://www.youtube.com/watch?v=8dgszLUSWHg");
      expect(summary.sourceLanguages).toEqual(["ja"]);
    }
    expect(
      episodeApiSummary(episode("https://www.youtube.com/watch?v=abc", 827)).officialSourceUrl,
    ).toBe("https://www.youtube.com/watch?v=abc");
  });
});
