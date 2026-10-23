// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import {
  VideoCaptionToggle,
  VideoTrackSettings,
} from "../src/components/episodes/VideoTrackControls";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
const tracks = [
  { index: 0, label: "日本語 · DVD" },
  { index: 1, label: "日本語 · Netflix" },
];
const noop = () => {};

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function controls(onCaptionChange = noop, onAudioChange = noop, onToggle = noop) {
  return (
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <VideoCaptionToggle textTracks={tracks} caption={1} onToggle={onToggle} />
      <VideoTrackSettings
        textTracks={tracks}
        caption={1}
        onCaptionChange={onCaptionChange}
        audioTracks={[
          { index: 0, name: "Français" },
          { index: 1, name: "日本語" },
        ]}
        audioTrack={0}
        onAudioChange={onAudioChange}
      />
    </NextIntlClientProvider>
  );
}

test("CC exposes its state and settings name the current caption and real voice", () => {
  const html = renderToStaticMarkup(controls());
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('title="Sous-titres · 日本語 · Netflix (C)"');
  expect(html).toContain('aria-label="Piste audio"');
  expect(html).toContain('aria-label="Sous-titres"');
  expect(html).toContain("Français");
});

test("a single real voice is displayed without fabricating a switch or subtitles", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <VideoCaptionToggle textTracks={[]} caption={-1} onToggle={noop} />
      <VideoTrackSettings
        textTracks={[]}
        caption={-1}
        onCaptionChange={noop}
        audioTracks={[{ index: 0, name: "日本語" }]}
        audioTrack={0}
        onAudioChange={noop}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("日本語");
  expect(html).not.toContain('role="combobox"');
  expect(html).not.toContain("Sous-titres");
});

test.skipIf(typeof document === "undefined")(
  "CC, captions off, edition selection and audio selection invoke their actual controls",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const captions: number[] = [];
    const audio: number[] = [];
    let toggles = 0;
    function InteractiveControls() {
      const [caption, setCaption] = useState(1);
      const [audioTrack, setAudioTrack] = useState(0);
      return (
        <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
          <VideoCaptionToggle
            textTracks={tracks}
            caption={caption}
            onToggle={() => {
              toggles++;
            }}
          />
          <VideoTrackSettings
            textTracks={tracks}
            caption={caption}
            onCaptionChange={(index) => {
              captions.push(index);
              setCaption(index);
            }}
            audioTracks={[
              { index: 0, name: "Français" },
              { index: 1, name: "日本語" },
            ]}
            audioTrack={audioTrack}
            onAudioChange={(index) => {
              audio.push(index);
              setAudioTrack(index);
            }}
          />
        </NextIntlClientProvider>
      );
    }
    await act(async () => root!.render(<InteractiveControls />));
    await act(async () => host!.querySelector<HTMLButtonElement>("[aria-pressed]")!.click());
    expect(toggles).toBe(1);
    async function choose(label: string, option: string) {
      await act(async () => {
        host!.querySelector<HTMLButtonElement>(`[role="combobox"][aria-label="${label}"]`)!.click();
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
      const listbox = Array.from(document.querySelectorAll('[role="listbox"]')).at(-1)!;
      const item = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]')).find(
        (element) => element.textContent?.includes(option),
      );
      expect(item).toBeDefined();
      await act(async () => {
        item!.click();
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
    }
    await choose("Sous-titres", "Désactivés");
    await choose("Sous-titres", "DVD");
    await choose("Piste audio", "日本語");
    expect(captions).toEqual([-1, 0]);
    expect(audio).toEqual([1]);
  },
);
