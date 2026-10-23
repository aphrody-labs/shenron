// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { useVideoTextTracks } from "../src/components/episodes/use-video-text-tracks";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
type Track = { kind: string; language: string; label: string; mode: string };

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  if (typeof localStorage !== "undefined") localStorage.removeItem("shenron:video:captions");
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

async function fixture(values: Track[]) {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const video = document.createElement("video");
  const events = new EventTarget();
  const tracks = Object.assign(values, {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  Object.defineProperty(video, "textTracks", { configurable: true, value: tracks });
  const videoRef = { current: video };
  let state: ReturnType<typeof useVideoTextTracks>;
  function Harness({ source }: { source: string }) {
    const current = useVideoTextTracks(videoRef, source);
    useEffect(() => {
      state = current;
    }, [current]);
    return null;
  }
  async function render(source = "episode-1") {
    await act(async () =>
      root!.render(
        <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
          <Harness source={source} />
        </NextIntlClientProvider>,
      ),
    );
  }
  await render();
  return { video, tracks, events, render, state: () => state! };
}

const caption = (label: string, language = "ja"): Track => ({
  kind: "subtitles",
  label,
  language,
  mode: "disabled",
});

test.skipIf(typeof document === "undefined")(
  "the captions menu excludes timed metadata and toggle restores the selected variant",
  async () => {
    const metadata: Track = { kind: "metadata", label: "ID3", language: "", mode: "hidden" };
    const f = await fixture([metadata, caption("DVD"), caption("Netflix")]);
    expect(f.state().textTracks).toEqual([
      { index: 1, label: "DVD" },
      { index: 2, label: "Netflix" },
    ]);
    await act(async () => f.state().selectCaption(2));
    expect(f.tracks.map((track) => track.mode)).toEqual(["hidden", "disabled", "showing"]);
    await act(async () => f.state().toggleCaptions());
    expect(f.state().caption).toBe(-1);
    await act(async () => f.video.dispatchEvent(new Event("loadedmetadata")));
    await act(async () => f.state().toggleCaptions());
    expect(f.state().caption).toBe(2);
    expect(f.tracks[2]!.mode).toBe("showing");
    await act(async () => f.state().selectCaption(0));
    expect(f.state().caption).toBe(2);
    expect(f.tracks[0]!.mode).toBe("hidden");
  },
);

test.skipIf(typeof document === "undefined")(
  "disabled captions survive late track discovery, metadata load and source changes",
  async () => {
    const f = await fixture([caption("DVD")]);
    await act(async () => f.state().selectCaption(-1));
    f.tracks[0]!.mode = "showing";
    await act(async () => f.video.dispatchEvent(new Event("loadedmetadata")));
    expect(f.tracks[0]!.mode).toBe("disabled");
    f.tracks.push({ ...caption("Netflix"), mode: "showing" });
    await act(async () => f.events.dispatchEvent(new Event("addtrack")));
    expect(f.state().textTracks).toHaveLength(2);
    expect(f.tracks.map((track) => track.mode)).toEqual(["disabled", "disabled"]);
    await f.render("episode-2");
    expect(f.state().caption).toBe(-1);
    expect(JSON.parse(localStorage.getItem("shenron:video:captions")!)).toBe("off");
  },
);

test.skipIf(typeof document === "undefined")(
  "preferences follow the same language and edition instead of an unstable track index",
  async () => {
    const f = await fixture([caption("DVD"), caption("Netflix")]);
    await act(async () => f.state().selectCaption(1));
    f.tracks.reverse();
    f.tracks.forEach((track) => {
      track.mode = "disabled";
    });
    await f.render("episode-2");
    expect(f.state().caption).toBe(0);
    expect(f.tracks[0]!.label).toBe("Netflix");
    f.tracks.splice(0, 1);
    // A new video's default track can become active before metadata is restored.
    f.tracks[0]!.mode = "showing";
    await f.render("episode-3");
    expect(f.state().caption).toBe(-1);
    expect(f.tracks[0]!.mode).toBe("disabled");
  },
);

test.skipIf(typeof document === "undefined")(
  "external native track changes update the control and do not modify chapters",
  async () => {
    const chapters: Track = { kind: "chapters", label: "Scenes", language: "", mode: "hidden" };
    const f = await fixture([chapters, caption("DVD")]);
    f.tracks[1]!.mode = "showing";
    await act(async () => f.events.dispatchEvent(new Event("change")));
    expect(f.state().caption).toBe(1);
    await act(async () => f.state().selectCaption(-1));
    expect(f.tracks[0]!.mode).toBe("hidden");
  },
);
