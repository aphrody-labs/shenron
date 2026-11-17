// SPDX-License-Identifier: Apache-2.0
import {
  unavailablePlaybackCapabilities,
  type PlaybackCapabilities,
  type PlaybackVariant,
} from "@aphrody/shenron-api/contract";

/** Declares existing transports without resolving or fetching any media. */
export function declarePlaybackCapabilities(
  episodeOnDemand: boolean,
  streams: Record<string, { url?: string; type?: string; at?: number }>,
  now = Date.now(),
): PlaybackCapabilities {
  const result = unavailablePlaybackCapabilities();
  result.episodeOnDemand = episodeOnDemand;
  for (const [key, stream] of Object.entries(streams)) {
    const match = /^(movie-)?([1-9]\d{0,9})(?:-(vf|vostfr))?$/.exec(key);
    if (!match || !stream || !Number.isFinite(stream.at)) continue;
    const age = now - stream.at!;
    if (age < 0 || age >= 8 * 3600 * 1000 || !["hls", "mp4"].includes(stream.type ?? "")) continue;
    if (!stream.url || !URL.canParse(stream.url)) continue;
    const source = new URL(stream.url);
    if (!["https:", "http:"].includes(source.protocol)) continue;
    const field = match[1] ? result.cachedMovieVariants : result.cachedEpisodeVariants;
    const variants = (field[match[2]!] ??= []);
    const variant = (match[3] ?? "default") as PlaybackVariant;
    if (!variants.includes(variant)) variants.push(variant);
  }
  return result;
}
