import { expect, test } from "bun:test";
import {
  parsePlaybackCapabilities,
  supportsPlaybackVariant,
} from "../src/contract/playback-capabilities";

test("declarations fail closed and do not infer a requested version", () => {
  const capabilities = parsePlaybackCapabilities({
    episodeOnDemand: "true",
    cachedEpisodeVariants: { "1": ["default", "secret-url"], token: ["vostfr"] },
    cachedMovieVariants: { "2": ["vf", "vf"] },
    secret: "private",
  });
  expect(supportsPlaybackVariant(capabilities, "episode", 1)).toBe(true);
  expect(supportsPlaybackVariant(capabilities, "episode", 1, "vostfr")).toBe(false);
  expect(supportsPlaybackVariant(capabilities, "movie", 2, "vostfr")).toBe(false);
  expect(supportsPlaybackVariant(capabilities, "movie", 2, "vf")).toBe(true);
  expect(JSON.stringify(capabilities)).not.toContain("private");
  expect(parsePlaybackCapabilities(null).episodeOnDemand).toBe(false);
});
