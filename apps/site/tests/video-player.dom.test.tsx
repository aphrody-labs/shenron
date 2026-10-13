// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";

mock.module("../src/components/episodes/use-video-source", () => ({
  useVideoSource: () => ({
    status: "ready",
    levels: [],
    quality: -1,
    selectQuality() {},
    audioTracks: [],
    audioTrack: -1,
    selectAudioTrack() {},
    retry() {},
  }),
}));
const { VideoPlayer } = await import("../src/components/episodes/VideoPlayer");
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

function player() {
  return (
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <VideoPlayer src="/api/episodes/875/video" title="Le dieu de la Destruction" />
    </NextIntlClientProvider>
  );
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test("SSR preserves playable native controls until the enhanced toolbar hydrates", () => {
  const html = renderToStaticMarkup(player());
  expect(html).toContain('controls=""');
  expect(html).toContain('hidden=""');
  expect(html).toContain('aria-label="Le dieu de la Destruction"');
  expect(html).not.toContain('title="Le dieu de la Destruction"');
});

test.skipIf(typeof document === "undefined")(
  "hydration removes duplicate controls and seeks within the observed duration",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(player()));
    const video = container.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(false);
    expect(
      container.querySelector('[aria-label="Commandes de lecture"]')?.closest("[hidden]"),
    ).toBeNull();
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 95 });
    await act(async () => video.dispatchEvent(new Event("durationchange", { bubbles: true })));
    const forward = container.querySelector<HTMLButtonElement>(
      '[aria-label="Avancer de 10 secondes"]',
    )!;
    await act(async () => forward.click());
    expect(video.currentTime).toBe(100);
    const backwards = container.querySelector<HTMLButtonElement>(
      '[aria-label="Reculer de 10 secondes"]',
    )!;
    await act(async () => backwards.click());
    expect(video.currentTime).toBe(90);
  },
);

test.skipIf(typeof document === "undefined")(
  "cinema mode locks scrolling and Escape restores the existing body style",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(player()));
    const previous = document.body.style.overflow;
    const theater = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Mode cinéma",
    )!;
    await act(async () => theater.click());
    expect(container.querySelector('[data-theater="true"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    const region = container.querySelector('[role="region"]')!;
    await act(async () =>
      region.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(document.body.style.overflow).toBe(previous);
    expect(container.querySelector('[data-theater="true"]')).toBeNull();
  },
);
