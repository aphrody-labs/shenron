// SPDX-License-Identifier: Apache-2.0
import {
  PLAYBACK_CAPABILITIES_PATH,
  parsePlaybackCapabilities,
  unavailablePlaybackCapabilities,
  type PlaybackCapabilities,
} from "@aphrody/shenron-api/contract";
import { API_URL } from "./config";

/** One shared, short-lived declaration per server process, independent of catalogue caching. */
export function createPlaybackCapabilityReader(
  load: () => Promise<unknown>,
  now: () => number = Date.now,
) {
  let expiresAt = 0;
  let value = unavailablePlaybackCapabilities();
  let pending: Promise<PlaybackCapabilities> | null = null;
  return async (): Promise<PlaybackCapabilities> => {
    if (now() < expiresAt) return value;
    if (pending) return pending;
    pending = (async () => {
      try {
        value = parsePlaybackCapabilities(await load());
      } catch {
        value = unavailablePlaybackCapabilities();
      }
      expiresAt = now() + 30_000;
      return value;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

export const readPlaybackCapabilities = createPlaybackCapabilityReader(async () => {
  const response = await fetch(`${API_URL}${PLAYBACK_CAPABILITIES_PATH}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("Playback capability declaration unavailable");
  return response.json();
});
