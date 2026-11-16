// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { EPISODE_5_CONFIG, PROVIDERS_ROSTER } from "./episode-stream-workflow";

describe("Episode 5 stream workflow", () => {
  it("validates Episode 5 workflow configuration and 12+ providers", () => {
    expect(EPISODE_5_CONFIG.episodeId).toBe(5);
    expect(EPISODE_5_CONFIG.title).toContain("Yamcha");
    expect(EPISODE_5_CONFIG.durationSeconds).toBe(1440);

    expect(PROVIDERS_ROSTER.length).toBeGreaterThanOrEqual(10);
    expect(PROVIDERS_ROSTER.some((p) => p.provider === "hyperframes")).toBe(true);
    expect(PROVIDERS_ROSTER.some((p) => p.provider === "remotion")).toBe(true);
    expect(PROVIDERS_ROSTER.some((p) => p.provider === "crunchyroll")).toBe(true);
  });
});
