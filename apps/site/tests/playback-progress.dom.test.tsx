// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContinueRail } from "../src/components/history/ContinueRail";
import { recordHistory } from "../src/lib/history";
import {
  getPlaybackProgress,
  observePlaybackProgress,
  readPlaybackProgress,
  recordPlaybackProgress,
} from "../src/lib/playback-progress";

const key = "dbfr_playback_progress_v1";
let cleanup = () => {};
let host: HTMLDivElement | undefined;
let root: Root | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  cleanup();
  cleanup = () => {};
  host?.remove();
  host = undefined;
  window.localStorage.removeItem(key);
  window.localStorage.removeItem("dbfr_history_v1");
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function fixture(id = "875") {
  host = document.createElement("div");
  host.setAttribute("data-watch-layout", "");
  const marker = document.createElement("span");
  const stage = document.createElement("div");
  stage.setAttribute("data-watch-stage", "");
  const video = document.createElement("video");
  const hero = document.createElement("video");
  host.append(marker, stage, hero);
  stage.append(video);
  document.body.append(host);
  Object.defineProperties(video, {
    duration: { configurable: true, value: 1200 },
    currentTime: { configurable: true, writable: true, value: 120 },
    paused: { configurable: true, value: true },
    ended: { configurable: true, value: false },
  });
  cleanup = observePlaybackProgress(marker, "episode", id, window.location.pathname);
  return { marker, video, hero };
}

test("progress persists only finite VOD measurements and deduplicates by episode identity", () => {
  recordPlaybackProgress("episode", "875", 120, 1200);
  recordPlaybackProgress("episode", "875", 180, 1200);
  recordPlaybackProgress("movie", "875", 500, 3600);
  recordPlaybackProgress("episode", "876", 10, Number.POSITIVE_INFINITY);
  recordPlaybackProgress("episode", "877", Number.NaN, 1200);
  expect(readPlaybackProgress()).toHaveLength(2);
  expect(getPlaybackProgress("episode", "875")?.seconds).toBe(180);
  expect(getPlaybackProgress("movie", "875")?.seconds).toBe(500);
});

test("corrupt storage and invalid saved values are ignored", () => {
  window.localStorage.setItem(key, "{bad");
  expect(readPlaybackProgress()).toEqual([]);
  window.localStorage.setItem(
    key,
    JSON.stringify([
      { kind: "episode", id: "875", seconds: 9000, duration: 1200, completed: false, updatedAt: 1 },
    ]),
  );
  expect(readPlaybackProgress()).toEqual([]);
});

test("completion remains recorded until a real rewatch starts", () => {
  recordPlaybackProgress("episode", "875", 1190, 1200);
  expect(getPlaybackProgress("episode", "875")?.completed).toBe(true);
  recordPlaybackProgress("episode", "875", 30, 1200);
  expect(getPlaybackProgress("episode", "875")?.completed).toBe(false);
});

test("stage observer ignores hero video and metadata-only visits, then saves on pause", () => {
  const { video, hero } = fixture();
  hero.dispatchEvent(new Event("play"));
  video.dispatchEvent(new Event("timeupdate"));
  expect(readPlaybackProgress()).toEqual([]);
  video.dispatchEvent(new Event("play"));
  video.currentTime = 123;
  video.dispatchEvent(new Event("pause"));
  expect(getPlaybackProgress("episode", "875")?.seconds).toBe(123);
});

test("ended saves completion and cleanup does not sample a replacement episode", () => {
  const { video, marker } = fixture();
  video.dispatchEvent(new Event("play"));
  video.dispatchEvent(new Event("ended"));
  expect(getPlaybackProgress("episode", "875")?.completed).toBe(true);
  video.currentTime = 600;
  cleanup();
  expect(getPlaybackProgress("episode", "875")?.seconds).toBe(1200);
  cleanup = observePlaybackProgress(marker, "episode", "876", window.location.pathname);
  video.dispatchEvent(new Event("timeupdate"));
  expect(getPlaybackProgress("episode", "876")).toBeNull();
  video.dispatchEvent(new Event("play"));
  expect(getPlaybackProgress("episode", "876")?.seconds).toBe(600);
});

test("source replacement resets started state and detached observers stop recording", () => {
  const { video } = fixture();
  video.dispatchEvent(new Event("play"));
  video.currentTime = 150;
  video.dispatchEvent(new Event("timeupdate"));
  video.dispatchEvent(new Event("emptied"));
  video.currentTime = 900;
  video.dispatchEvent(new Event("pause"));
  expect(getPlaybackProgress("episode", "875")?.seconds).toBe(150);
  cleanup();
  window.localStorage.removeItem(key);
  video.dispatchEvent(new Event("play"));
  expect(readPlaybackProgress()).toEqual([]);
});

test("resume rail displays measured progress, excludes visits and completed episodes, updates live", async () => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  for (const id of ["875", "876", "877"]) {
    recordHistory({ kind: "episode", id, title: `Episode ${id}`, href: `/wiki/episodes/${id}` });
  }
  recordPlaybackProgress("episode", "875", 120, 1200);
  recordPlaybackProgress("episode", "876", 1200, 1200, true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<ContinueRail kinds={["episode"]} titleKey="history.resumeWatching" />),
  );
  expect(host.querySelector('a[href="/wiki/episodes/875"]')).not.toBeNull();
  expect(host.querySelector('a[href="/wiki/episodes/876"]')).toBeNull();
  expect(host.querySelector('a[href="/wiki/episodes/877"]')).toBeNull();
  expect(host.textContent).toContain("2:00 / 20:00");
  expect(host.querySelector("progress")?.getAttribute("value")).toBe("120");
  await act(async () => recordPlaybackProgress("episode", "875", 1200, 1200, true));
  expect(host.querySelector("section")).toBeNull();
  expect(window.localStorage.getItem("dbfr_history_v1")).toContain("875");
});
