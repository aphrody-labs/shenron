import { expect, test } from "bun:test";
import { declarePlaybackCapabilities } from "../src/api/playback-capabilities";

test("capabilities expose only fresh exact versions, never upstream credentials", () => {
  const now = 100_000_000;
  const source = {
    url: "https://upstream.example/master.m3u8?private=secret",
    type: "hls",
    at: now,
  };
  const result = declarePlaybackCapabilities(
    false,
    {
      "10-vostfr": source,
      "movie-2-vf": source,
      "movie-3-vostfr": { ...source, at: now - 8 * 3600 * 1000 },
      "20": { ...source, at: now + 1 },
      "21": { ...source, type: "drm" },
      "22": { ...source, url: "javascript:bad" },
      "bad-token": source,
    },
    now,
  );
  expect(result).toEqual({
    episodeOnDemand: false,
    cachedEpisodeVariants: { "10": ["vostfr"] },
    cachedMovieVariants: { "2": ["vf"] },
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(declarePlaybackCapabilities(true, {}, now).episodeOnDemand).toBe(true);
});
