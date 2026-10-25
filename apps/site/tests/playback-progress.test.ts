// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  playbackTimeLabel,
  readPlaybackProgress,
  recordPlaybackProgress,
} from "../src/lib/playback-progress";

test("playback time labels retain hours and tolerate unknown durations", () => {
  expect(playbackTimeLabel(65.9)).toBe("1:05");
  expect(playbackTimeLabel(3665)).toBe("1:01:05");
  expect(playbackTimeLabel(Number.NaN)).toBe("0:00");
  expect(playbackTimeLabel(-20)).toBe("0:00");
});

test("server rendering never requires browser storage", () => {
  if (typeof window !== "undefined") return;
  expect(readPlaybackProgress()).toEqual([]);
  expect(() => recordPlaybackProgress("episode", "875", 50, 1400)).not.toThrow();
});
