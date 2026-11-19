// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import fr from "../messages/fr.json";
import {
  isPlayerShortcut,
  TvPlayer,
  type TvPlayerProps,
  type VideoSourceOption,
} from "../src/components/tv/TvPlayer";

function render(props: TvPlayerProps) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <TvPlayer {...props} />
    </NextIntlClientProvider>,
  );
}

const testSources: VideoSourceOption[] = [
  {
    id: "cdn-1080p",
    name: "1080p FHD",
    type: "direct",
    url: "https://dragonballfr.com/api/episodes/875/video",
  },
  {
    id: "embed-alt",
    name: "Lecteur 2",
    type: "iframe",
    url: "https://vidmoly.biz/embed-test.html",
  },
];

test("TvPlayer renders native video with accessible controls and ambient mode", () => {
  const html = render({
    title: "Le dieu de la Destruction",
    seriesTitle: "Dragon Ball Super: Beerus",
    episodeNumber: 1,
    sources: testSources,
    poster: "/images/poster.webp",
  });

  expect(html).toContain("<video");
  expect(html).toContain('src="https://dragonballfr.com/api/episodes/875/video"');
  expect(html).toContain(`aria-label="${fr.mediaPlayback.seekPosition}"`);
  expect(html).toContain(`aria-label="${fr.mediaPlayback.play} (k)"`);
  expect(html).toContain(`aria-label="${fr.mediaPlayback.speed}"`);
  expect(html).toContain(`aria-label="${fr.mediaPlayback.fullscreen} (f)"`);
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-label="Mode ambiant"');
  expect(html).toContain("1080p FHD");
});

test("TvPlayer renders embed iframe when an iframe source is selected", () => {
  const iframeSources: VideoSourceOption[] = [
    {
      id: "embed-1",
      name: "Vidmoly",
      type: "iframe",
      url: "https://vidmoly.biz/embed-kshbhm2m121e.html",
    },
  ];

  const html = render({
    title: "Le Grand Depart",
    seriesTitle: "Dragon Ball",
    episodeNumber: 1,
    sources: iframeSources,
  });

  expect(html).toContain("<iframe");
  expect(html).toContain('src="https://vidmoly.biz/embed-kshbhm2m121e.html"');
});

test("TvPlayer leaves src unset on an HLS source so the decoder can attach", () => {
  const html = render({
    title: "Le Grand Depart",
    seriesTitle: "Dragon Ball",
    episodeNumber: 1,
    sources: [
      {
        id: "hls",
        name: "HLS",
        type: "direct",
        url: "https://tv.dragonballfr.com/hls/episode-1/master.m3u8",
      },
    ],
  });

  const video = html.match(/<video\b[^>]*>/)?.[0] ?? "";
  expect(video).not.toBe("");
  expect(video).not.toContain("src=");
  expect(html).not.toContain("<iframe");
});

test("TvPlayer shows the unavailable text and no iframe without sources", () => {
  const html = render({
    title: "Le Grand Depart",
    seriesTitle: "Dragon Ball",
    episodeNumber: 1,
    sources: [],
  });

  expect(html).not.toContain("<iframe");
  expect(html).not.toContain("<video");
  expect(html).toContain("Lecture non disponible");
});

test("TvPlayer exposes the ambient toggle state and an always-present live region", () => {
  const html = render({
    title: "Le Grand Depart",
    seriesTitle: "Dragon Ball",
    episodeNumber: 1,
    sources: testSources,
  });

  expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Mode ambiant"/);
  expect(html).toContain('role="status" aria-live="polite"');
});

test("TvPlayer renders no captions track without a subtitle source", () => {
  const without = render({
    title: "Le Grand Depart",
    seriesTitle: "Dragon Ball",
    episodeNumber: 1,
    sources: testSources,
    subtitles: [{ label: "Francais", srcLang: "fr", src: "" }],
  });
  expect(without).not.toContain("<track");

  const withTrack = render({
    title: "Le Grand Depart",
    seriesTitle: "Dragon Ball",
    episodeNumber: 1,
    sources: testSources,
    subtitles: [{ label: "Francais", srcLang: "fr", src: "https://tv.dragonballfr.com/vtt/1.fr.vtt" }],
  });
  expect(withTrack).toContain('src="https://tv.dragonballfr.com/vtt/1.fr.vtt"');
  expect(withTrack).not.toContain('kind="captions"');
});

test("TvPlayer leaves no invisible focus on the scrubber", () => {
  const html = render({
    title: "Le Grand Depart",
    seriesTitle: "Dragon Ball",
    episodeNumber: 1,
    sources: testSources,
  });
  expect(html).not.toContain("focus-visible:outline-none");
  expect(html).toContain("group-has-[:focus-visible]/scrub:ring-2");
});

function keyEvent(
  key: string,
  target: { tagName: string; role?: string; isContentEditable?: boolean } | null = null,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
    target: target
      ? ({
          tagName: target.tagName,
          isContentEditable: target.isContentEditable,
          getAttribute: (name: string) => (name === "role" ? (target.role ?? null) : null),
        } as unknown as EventTarget)
      : null,
  };
}

test("isPlayerShortcut accepts plain keys on the page body", () => {
  for (const key of [" ", "k", "j", "l", "f", "m", "t", "5", "ArrowLeft", "ArrowRight"]) {
    expect(isPlayerShortcut(keyEvent(key, { tagName: "BODY" }))).toBe(true);
  }
});

test("isPlayerShortcut rejects browser chords", () => {
  expect(isPlayerShortcut(keyEvent("f", { tagName: "BODY" }, { ctrlKey: true }))).toBe(false);
  expect(isPlayerShortcut(keyEvent("l", { tagName: "BODY" }, { ctrlKey: true }))).toBe(false);
  expect(isPlayerShortcut(keyEvent("k", { tagName: "BODY" }, { metaKey: true }))).toBe(false);
  expect(isPlayerShortcut(keyEvent("ArrowLeft", { tagName: "BODY" }, { altKey: true }))).toBe(false);
});

test("isPlayerShortcut leaves activation keys to focused controls", () => {
  for (const tagName of ["BUTTON", "A", "SUMMARY"]) {
    expect(isPlayerShortcut(keyEvent(" ", { tagName }))).toBe(false);
    expect(isPlayerShortcut(keyEvent("Enter", { tagName }))).toBe(false);
  }
  expect(isPlayerShortcut(keyEvent(" ", { tagName: "DIV", role: "slider" }))).toBe(false);
  expect(isPlayerShortcut(keyEvent("k", { tagName: "BUTTON" }))).toBe(true);
});

test("isPlayerShortcut ignores text entry targets", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    expect(isPlayerShortcut(keyEvent("k", { tagName }))).toBe(false);
  }
  expect(isPlayerShortcut(keyEvent("k", { tagName: "DIV", isContentEditable: true }))).toBe(false);
  expect(isPlayerShortcut(keyEvent("k"))).toBe(true);
});
