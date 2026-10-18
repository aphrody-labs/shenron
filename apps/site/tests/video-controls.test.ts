// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  isHlsSource,
  videoKeyAction,
  videoResumeKey,
  videoResumePosition,
  videoSeekTarget,
  videoVolumeStep,
  VIDEO_PLAYBACK_RATES,
} from "../src/lib/video-controls";

test("HLS detection uses the HTTP pathname and preserves query tokens", () => {
  expect(isHlsSource("/video/MASTER.M3U8?token=abc#chapter")).toBe(true);
  expect(isHlsSource("https://official.example/stream.m3u8?token=abc")).toBe(true);
  expect(isHlsSource("https://official.example/video.mp4?label=.m3u8")).toBe(false);
  expect(isHlsSource("blob:https://official.example/stream.m3u8")).toBe(false);
  expect(isHlsSource("javascript:stream.m3u8")).toBe(false);
});

test("shortcuts do not consume focused controls, editors or browser shortcuts", () => {
  for (const tag of ["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"])
    expect(videoKeyAction(" ", tag)).toBeNull();
  expect(videoKeyAction("k", "VIDEO", { modified: true })).toBeNull();
  expect(videoKeyAction("k", "DIV", { editable: true })).toBeNull();
  expect(videoKeyAction("k", "VIDEO", { repeat: true })).toBeNull();
  expect(videoKeyAction("k", "VIDEO")).toBe("play");
  expect(videoKeyAction("ArrowLeft", "DIV")).toBe("backward");
  expect(videoKeyAction("P", "VIDEO")).toBe("pip");
  expect(videoKeyAction("J", "VIDEO")).toBe("backward");
  expect(videoKeyAction("c", "VIDEO")).toBe("captions");
});

test("seeking respects VOD and live windows without invalid currentTime writes", () => {
  expect(videoSeekTarget(2, -10, 0, 100)).toBe(0);
  expect(videoSeekTarget(98, 10, 0, 100)).toBe(100);
  expect(videoSeekTarget(125, -10, 120, 140)).toBe(120);
  expect(videoSeekTarget(135, 10, 120, 140)).toBe(140);
  expect(videoSeekTarget(0, 10, 0, NaN)).toBeNull();
  expect(videoSeekTarget(0, 10, 0, Infinity)).toBeNull();
  expect(videoSeekTarget(0, 10, 10, 0)).toBeNull();
  expect(VIDEO_PLAYBACK_RATES).toContain(1);
});

describe("reprise et volume", () => {
  test("clé de reprise sans jeton de requête", () => {
    expect(videoResumeKey("https://cdn.example/a/b.m3u8?token=x")).toBe(
      "shenron:video-position:https://cdn.example/a/b.m3u8",
    );
  });
  test("reprise seulement entre l'intro et le générique", () => {
    expect(videoResumePosition(5, 1400)).toBeNull();
    expect(videoResumePosition(600, 1400)).toBe(600);
    expect(videoResumePosition(1390, 1400)).toBeNull();
    expect(videoResumePosition(600, Number.NaN)).toBeNull();
  });
  test("pas de volume borné, flèches haut et bas", () => {
    expect(videoVolumeStep(0.95, 0.1)).toBe(1);
    expect(videoVolumeStep(0.05, -0.1)).toBe(0);
    expect(videoKeyAction("ArrowUp", "VIDEO")).toBe("volumeUp");
    expect(videoKeyAction("ArrowDown", "DIV")).toBe("volumeDown");
  });
});
