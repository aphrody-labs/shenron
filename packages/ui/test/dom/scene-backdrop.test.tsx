// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { SceneBackdrop } from "../../src/public/SceneBackdrop";

class PolicyTarget extends EventTarget {
  matches = false;
  saveData = false;
  listeners = new Set<EventListenerOrEventListenerObject>();
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (callback) this.listeners.add(callback);
    super.addEventListener(type, callback, options);
  }
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (callback) this.listeners.delete(callback);
    super.removeEventListener(type, callback, options);
  }
}
const originalMedia = window.matchMedia;
const originalConnection = Object.getOwnPropertyDescriptor(navigator, "connection");
const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
const mediaPrototype = window.HTMLMediaElement.prototype;
const originalPlay = mediaPrototype.play;
const originalPause = mediaPrototype.pause;
let hidden = false;
let reduce: PolicyTarget;
let phone: PolicyTarget;
let network: PolicyTarget;
let played: HTMLMediaElement[];
let paused: HTMLMediaElement[];
const scene = { image: "/still.png", video: "/clip.mp4", poster: "/poster.png", accent: "gold" };

beforeEach(() => {
  hidden = false;
  played = [];
  paused = [];
  reduce = new PolicyTarget();
  phone = new PolicyTarget();
  network = new PolicyTarget();
  window.matchMedia = ((query: string) =>
    query.includes("reduced-motion") ? reduce : phone) as unknown as typeof window.matchMedia;
  Object.defineProperty(navigator, "connection", { configurable: true, value: network });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  mediaPrototype.play = function () {
    played.push(this);
    return Promise.resolve();
  };
  mediaPrototype.pause = function () {
    paused.push(this);
  };
});
afterEach(() => {
  cleanup();
  window.matchMedia = originalMedia;
  mediaPrototype.play = originalPlay;
  mediaPrototype.pause = originalPause;
  if (originalConnection) Object.defineProperty(navigator, "connection", originalConnection);
  else Reflect.deleteProperty(navigator, "connection");
  if (originalHidden) Object.defineProperty(document, "hidden", originalHidden);
  else Reflect.deleteProperty(document, "hidden");
});

const change = (target: PolicyTarget, property: "matches" | "saveData", value: boolean) =>
  act(() => {
    target[property] = value;
    target.dispatchEvent(new Event("change"));
  });

test("live motion, network and phone preferences replace video with the still", () => {
  const { container, unmount } = render(<SceneBackdrop scene={scene} active />);
  const first = container.querySelector("video")!;
  expect(first.preload).toBe("auto");
  expect(played).toContain(first);
  for (const [target, property] of [
    [reduce, "matches"],
    [network, "saveData"],
    [phone, "matches"],
  ] as const) {
    change(target, property, true);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(scene.image);
    change(target, property, false);
    expect(container.querySelector("video")).not.toBeNull();
  }
  expect(paused).toContain(first);
  unmount();
  expect(reduce.listeners.size + phone.listeners.size + network.listeners.size).toBe(0);
});

test("hidden documents pause without replacing the video, then resume on visibility", () => {
  const { container } = render(<SceneBackdrop scene={scene} active />);
  const video = container.querySelector("video")!;
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(container.querySelector("video")).toBe(video);
  expect(paused).toContain(video);
  expect(video.preload).toBe("none");
  const count = played.length;
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(played.length).toBe(count + 1);
  expect(container.querySelector("video")).toBe(video);
});

test("a failed clip falls back to the image; a different clip plays even with unchanged active state", () => {
  const { container, rerender } = render(<SceneBackdrop scene={scene} active />);
  const old = container.querySelector("video")!;
  fireEvent.error(old);
  expect(container.querySelector("video")).toBeNull();
  expect(container.querySelector("img")).not.toBeNull();
  rerender(<SceneBackdrop scene={{ ...scene, video: "/other.mp4" }} active />);
  const next = container.querySelector("video")!;
  expect(next).not.toBe(old);
  expect(played).toContain(next);
  expect(paused).toContain(old);
  rerender(<SceneBackdrop scene={{ ...scene, video: "/other.mp4" }} active={false} />);
  expect(next.preload).toBe("none");
  expect(paused).toContain(next);
});

test("a late play promise cannot restart a deactivated clip", async () => {
  let finish!: () => void;
  mediaPrototype.play = function () {
    played.push(this);
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  const { container, rerender } = render(<SceneBackdrop scene={scene} active />);
  const video = container.querySelector("video")!;
  rerender(<SceneBackdrop scene={scene} active={false} />);
  const pauses = paused.filter((value) => value === video).length;
  await act(async () => {
    finish();
    await Promise.resolve();
  });
  expect(paused.filter((value) => value === video).length).toBeGreaterThan(pauses);
});

test("autoplay rejection has a still fallback and server rendering prioritizes the still", async () => {
  mediaPrototype.play = () => Promise.reject(new Error("Autoplay blocked"));
  const { container } = render(<SceneBackdrop scene={scene} active />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(container.querySelector("video")).toBeNull();
  expect(container.querySelector("img")).not.toBeNull();
  const html = renderToString(<SceneBackdrop scene={scene} active priority />);
  expect(html).not.toContain("<video");
  expect(html).toContain('fetchPriority="high"');
});
