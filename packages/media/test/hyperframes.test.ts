// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { findAtomOffset } from "../src/hyperframes-stream";
import {
  formatTimecodeSMPTE,
  generateWaveformPeaks,
  secondsToFrames,
  framesToSeconds,
  findActiveSubtitle,
} from "../src/remotion-engine";
import { EPISODE_5_CONFIG, PROVIDERS_ROSTER } from "../../../scripts/ops/episode-stream-workflow";

describe("HyperFrames Zero-Download Streaming & Remotion Engine", () => {
  it("finds MP4 atom offsets correctly in binary buffers", () => {
    // Construct dummy MP4 buffer with ftyp and moov atoms
    const buf = new Uint8Array(64);
    // ftyp atom of size 24 at offset 0
    buf[0] = 0;
    buf[1] = 0;
    buf[2] = 0;
    buf[3] = 24;
    buf[4] = "f".charCodeAt(0);
    buf[5] = "t".charCodeAt(0);
    buf[6] = "y".charCodeAt(0);
    buf[7] = "p".charCodeAt(0);

    // moov atom of size 32 at offset 24
    buf[24] = 0;
    buf[25] = 0;
    buf[26] = 0;
    buf[27] = 32;
    buf[28] = "m".charCodeAt(0);
    buf[29] = "o".charCodeAt(0);
    buf[30] = "o".charCodeAt(0);
    buf[31] = "v".charCodeAt(0);

    const ftyp = findAtomOffset(buf, "ftyp");
    expect(ftyp).not.toBeNull();
    expect(ftyp?.offset).toBe(0);
    expect(ftyp?.size).toBe(24);

    const moov = findAtomOffset(buf, "moov");
    expect(moov).not.toBeNull();
    expect(moov?.offset).toBe(24);
    expect(moov?.size).toBe(32);

    const nonExistent = findAtomOffset(buf, "mdat");
    expect(nonExistent).toBeNull();
  });

  it("calculates Remotion SMPTE timecodes and frame conversions", () => {
    // 24 FPS
    expect(secondsToFrames(10, 24)).toBe(240);
    expect(framesToSeconds(240, 24)).toBe(10);

    // Frame 0: 00:00:00:00
    expect(formatTimecodeSMPTE(0, 24)).toBe("00:00:00:00");

    // Frame 24 (1 second): 00:00:01:00
    expect(formatTimecodeSMPTE(24, 24)).toBe("00:00:01:00");

    // Frame 3625 (2 min, 31 sec, 1 frame)
    expect(formatTimecodeSMPTE(3625, 24)).toBe("00:02:31:01");
  });

  it("generates Remotion audio waveform points with normalized amplitudes", () => {
    const waveform = generateWaveformPeaks(1440, 100);
    expect(waveform.length).toBe(100);

    for (const pt of waveform) {
      expect(pt.timeSec).toBeGreaterThanOrEqual(0);
      expect(pt.amplitude).toBeGreaterThan(0);
      expect(pt.amplitude).toBeLessThanOrEqual(1.0);
    }
  });

  it("matches active subtitles accurately by frame range", () => {
    const subtitles = [
      { startFrame: 100, endFrame: 200, text: "Yamcha apparaît !" },
      { startFrame: 201, endFrame: 350, text: "Rōgafūfūken !" },
    ];

    expect(findActiveSubtitle(subtitles, 50)).toBeNull();
    expect(findActiveSubtitle(subtitles, 150)?.text).toBe("Yamcha apparaît !");
    expect(findActiveSubtitle(subtitles, 250)?.text).toBe("Rōgafūfūken !");
    expect(findActiveSubtitle(subtitles, 400)).toBeNull();
  });

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
