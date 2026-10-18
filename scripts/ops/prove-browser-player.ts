// SPDX-License-Identifier: Apache-2.0
// Browser entry of scripts/ops/prove-browser.ts: drives the Shenron player stack on a local MP4.
import { createVideoPlayback } from "@aphrody/bun-video/playback";

const video = document.getElementById("v") as HTMLVideoElement;
const out: Record<string, unknown> = {};
(window as unknown as { __result: unknown }).__result = out;
try {
  const states: string[] = [];
  const playback = createVideoPlayback(video, {
    src: "/clip.mp4",
    onState: state => states.push(`${state.status}:${state.backend ?? "-"}`),
    onError: () => (out.error = "playback error"),
  });
  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error(video.error?.message ?? "media error")), { once: true });
    setTimeout(() => reject(new Error("timeout waiting for loadeddata")), 15000);
  });
  await video.play();
  const start = video.currentTime;
  await new Promise(resolve => setTimeout(resolve, 1200));
  Object.assign(out, {
    ready: video.readyState,
    width: video.videoWidth,
    height: video.videoHeight,
    duration: Math.round(video.duration * 10) / 10,
    advanced: video.currentTime > start,
    currentTime: Math.round(video.currentTime * 100) / 100,
    states,
  });
  playback.destroy();
} catch (error) {
  out.error = String((error as Error).message ?? error);
}
out.done = true;
