import { describe, expect, mock, test } from "bun:test";
import type { Episode } from "../src/lib/db-universe";

mock.module("server-only", () => ({}));
mock.module("../src/lib/db-universe", () => ({}));

const { episodeApiSummary } = await import("../src/lib/episode-api");

function episode(official_source_url: string | null): Episode {
  return {
    id: 827,
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
      "http://example.com/video",
      "javascript:alert(1)",
      "https://user:pass@example.com/video",
      "not a URL",
      null,
    ]) {
      expect(episodeApiSummary(episode(source)).officialSourceUrl).toBeNull();
    }
  });
});
