// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  secondsToFrames,
  framesToSeconds,
  formatTimecodeSMPTE,
  interpolate,
  generateWaveformPeaks,
  findActiveSubtitle,
  type SubtitleCue,
} from "../src/index";

describe("@aphrody/remotion timeline & SMPTE", () => {
  it("converts seconds to frames and vice versa accurately", () => {
    expect(secondsToFrames(1.5, 24)).toBe(36);
    expect(framesToSeconds(36, 24)).toBe(1.5);
    expect(secondsToFrames(0, 24)).toBe(0);
    expect(framesToSeconds(0, 24)).toBe(0);
  });

  it("formats SMPTE timecodes according to broadcast standards", () => {
    expect(formatTimecodeSMPTE(0, 24)).toBe("00:00:00:00");
    expect(formatTimecodeSMPTE(24, 24)).toBe("00:00:01:00");
    expect(formatTimecodeSMPTE(24 * 60, 24)).toBe("00:01:00:00");
    expect(formatTimecodeSMPTE(24 * 3600, 24)).toBe("01:00:00:00");
    expect(formatTimecodeSMPTE(36, 24)).toBe("00:00:01:12");
  });

  it("interpolates values smoothly between input and output ranges", () => {
    expect(interpolate(0, [0, 100], [0, 1])).toBe(0);
    expect(interpolate(50, [0, 100], [0, 1])).toBe(0.5);
    expect(interpolate(100, [0, 100], [0, 1])).toBe(1);
    // Extrapolation clamped by default
    expect(interpolate(-20, [0, 100], [0, 1])).toBe(0);
    expect(interpolate(150, [0, 100], [0, 1])).toBe(1);
  });
});

describe("@aphrody/remotion waveform & subtitles", () => {
  it("generates deterministic audio waveform peaks for dragon ball tracks", () => {
    const peaks = generateWaveformPeaks(120, 60);
    expect(peaks.length).toBe(60);
    for (const p of peaks) {
      expect(p.amplitude).toBeGreaterThanOrEqual(0.05);
      expect(p.amplitude).toBeLessThanOrEqual(1.0);
    }
  });

  it("finds the active subtitle cue at a given frame", () => {
    const cues: SubtitleCue[] = [
      { startFrame: 24, endFrame: 48, text: "Kamehameha!" },
      { startFrame: 50, endFrame: 96, text: "Son Goku!" },
    ];

    expect(findActiveSubtitle(cues, 10)).toBeNull();
    expect(findActiveSubtitle(cues, 30)?.text).toBe("Kamehameha!");
    expect(findActiveSubtitle(cues, 49)).toBeNull();
    expect(findActiveSubtitle(cues, 60)?.text).toBe("Son Goku!");
    expect(findActiveSubtitle(cues, 100)).toBeNull();
  });
});
