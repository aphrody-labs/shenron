// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  episodePlaybackMetadata,
  normalizeVideoPlayers,
  normalizeVideoSubtitles,
  normalizeSubtitleLanguage,
} from "../src/episode-playback";

const vf = {
  name: "VF · FHD1",
  provider: "mailru",
  embedUrl: "https://example.test/vf",
  lang: "vf" as const,
};
test("malformed and duplicate players do not create phantom counts or video versions", () => {
  const raw = [
    vf,
    { ...vf, name: "Duplicate" },
    null,
    "scalar",
    {},
    { ...vf, embedUrl: "javascript:alert(1)" },
    { ...vf, embedUrl: "https://user:secret@example.test/vf" },
    { ...vf, embedUrl: " " },
    { ...vf, embedUrl: "https://example.test/unknown", lang: "ja" },
  ];
  expect(normalizeVideoPlayers(raw)).toEqual([
    vf,
    { name: vf.name, provider: vf.provider, embedUrl: "https://example.test/unknown" },
  ]);
  const metadata = episodePlaybackMetadata({ players: raw });
  expect(metadata.playerCount).toBe(2);
  expect(metadata.versions).toEqual(["vf"]);
  expect(metadata.hasVostfr).toBe(false);
});

test("observed subtitle locales normalize provider casing and Japanese aliases", () => {
  expect(normalizeSubtitleLanguage("fr_fr")).toBe("fr-FR");
  expect(normalizeSubtitleLanguage("EN-us")).toBe("en-US");
  expect(normalizeSubtitleLanguage("jp")).toBe("ja");
  expect(normalizeSubtitleLanguage("JP_jp")).toBe("ja-JP");
  expect(normalizeSubtitleLanguage("not-a-language")).toBeNull();
  const src = "https://cdn.dragonballfr.com/media/episodes/875/ja.vtt";
  expect(
    normalizeVideoSubtitles([
      { lang: "jp", label: "Japanese", src },
      { lang: "ja", label: "Duplicate", src },
      { lang: "FR_fr", label: "French", src: src.replace("ja.vtt", "fr.vtt") },
    ]),
  ).toEqual([
    { lang: "ja", label: "Japanese", src },
    { lang: "fr-FR", label: "French", src: src.replace("ja.vtt", "fr.vtt") },
  ]);
});

test("same source with explicitly different versions stays selectable", () => {
  const metadata = episodePlaybackMetadata({ players: [vf, { ...vf, lang: "vostfr" }] });
  expect(metadata.playerCount).toBe(2);
  expect(metadata.versions).toEqual(["vf", "vostfr"]);
});

test("subtitle tracks remain separate from observed video versions", () => {
  const track = { src: "./assets/subtitles/db_episodes/445/ja.srt", lang: "ja", label: "Japanese" };
  const metadata = episodePlaybackMetadata({
    players: [vf],
    subtitles: [
      track,
      track,
      null,
      {},
      { ...track, src: "javascript:bad" },
      { ...track, src: "assets/subtitles/../../private.srt" },
    ],
  });
  expect(metadata.subtitles).toEqual([track]);
  expect(metadata.versions).toEqual(["vf"]);
  expect(normalizeVideoSubtitles("corrupt-json")).toEqual([]);
});

test("empty native metadata never guesses a dubbed or subtitled version", () => {
  expect(episodePlaybackMetadata({ players: null, subtitles: [] })).toEqual({
    players: [],
    subtitles: [],
    versions: [],
    playerCount: 0,
    hasVf: false,
    hasVostfr: false,
    hasVost: false,
  });
});
