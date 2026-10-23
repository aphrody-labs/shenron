// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const PLAYBACK_CAPABILITIES_PATH = "/api/playback/capabilities";
export const PlaybackCapabilitiesSchema = z.object({
  episodeOnDemand: z.boolean(),
  cachedEpisodeVariants: z.record(
    z.string().regex(/^[1-9]\d{0,9}$/),
    z.array(z.enum(["default", "vf", "vostfr"])),
  ),
  cachedMovieVariants: z.record(
    z.string().regex(/^[1-9]\d{0,9}$/),
    z.array(z.enum(["default", "vf", "vostfr"])),
  ),
});

export type PlaybackVariant = "default" | "vf" | "vostfr";
export interface PlaybackCapabilities {
  episodeOnDemand: boolean;
  cachedEpisodeVariants: Record<string, PlaybackVariant[]>;
  cachedMovieVariants: Record<string, PlaybackVariant[]>;
}

export function unavailablePlaybackCapabilities(): PlaybackCapabilities {
  return { episodeOnDemand: false, cachedEpisodeVariants: {}, cachedMovieVariants: {} };
}

/** The public declaration carries identifiers and versions, never upstream credentials. */
export function parsePlaybackCapabilities(value: unknown): PlaybackCapabilities {
  const result = unavailablePlaybackCapabilities();
  if (!value || typeof value !== "object") return result;
  const raw = value as Record<string, unknown>;
  result.episodeOnDemand = raw.episodeOnDemand === true;
  for (const field of ["cachedEpisodeVariants", "cachedMovieVariants"] as const) {
    const entries = raw[field];
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
    for (const [id, variants] of Object.entries(entries)) {
      if (!/^[1-9]\d{0,9}$/.test(id) || !Array.isArray(variants)) continue;
      const safe = variants.filter(
        (variant): variant is PlaybackVariant =>
          variant === "default" || variant === "vf" || variant === "vostfr",
      );
      if (safe.length) result[field][id] = [...new Set(safe)];
    }
  }
  return result;
}

export function supportsPlaybackVariant(
  capabilities: PlaybackCapabilities,
  kind: "episode" | "movie",
  id: number,
  variant: PlaybackVariant = "default",
): boolean {
  return (
    (kind === "episode" && capabilities.episodeOnDemand) ||
    (kind === "episode" ? capabilities.cachedEpisodeVariants : capabilities.cachedMovieVariants)[
      String(id)
    ]?.includes(variant) === true
  );
}
