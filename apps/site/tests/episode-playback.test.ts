// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { episodePlayback } from "../src/lib/episode-playback";

test("episode 875 advertises its same-origin MP4 transport without inventing HLS or a version", () => {
  const result = episodePlayback({ id: 875, stream_url: "https://27.mugiwara.one/dbs/dbs-1.mp4" });
  expect(result.nativeSource).toEqual({ src: "/api/episodes/875/video", type: "video/mp4" });
  expect(result.hlsMasterUrl).toBeNull();
  expect(result.versions).toEqual([]);
  expect(result.availability).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("mugiwara.one");
});

test("qualified Shenron CDN MP4 is played directly with byte ranges", () => {
  const source = "https://cdn.dragonballfr.com/media/episodes/beerus-01/optimized-720p.mp4";
  const result = episodePlayback({ id: 875, stream_url: source });
  expect(result.nativeSource).toEqual({ src: source, type: "video/mp4" });
  expect(result.hlsMasterUrl).toBeNull();
});

test("published episode media supplies native playback when the legacy stream field is absent", () => {
  const source = `https://cdn.dragonballfr.com/media/episodes/876/${"a".repeat(64)}/source.mp4`;
  const players = [{ name: "Shenron", provider: "shenron", embedUrl: source, lang: "vostfr" }];
  expect(episodePlayback({ id: 876, players }).nativeSource).toEqual({
    src: source,
    type: "video/mp4",
  });
  expect(episodePlayback({ id: 875, players }).nativeSource).toBeNull();
  expect(
    episodePlayback({ id: 876, players: [{ ...players[0], embedUrl: source + "?token=x" }] })
      .nativeSource,
  ).toBeNull();
  expect(
    episodePlayback({
      id: 876,
      players: [{ ...players[0], embedUrl: "https://example.test/video.mp4" }],
    }).nativeSource,
  ).toBeNull();
});

test("HLS metadata exposes the bot transport without leaking stored stream tokens", () => {
  const result = episodePlayback({
    id: 445,
    stream_url: "https://example.test/token/master.m3u8?private=token",
    players: [
      {
        name: "Source",
        provider: "observed",
        lang: "vostfr",
        embedUrl: "https://example.test/embed",
      },
    ],
    subtitles: [
      { src: "./assets/subtitles/db_episodes/445/ja.srt", lang: "ja", label: "Japanese" },
    ],
  });
  expect(result.hlsMasterUrl).toContain("/api/hls/445/master.m3u8");
  expect(result.nativeSource?.src ?? null).toBe(result.hlsMasterUrl);
  expect(result.versions).toEqual(["vostfr"]);
  expect(result.subtitles).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("private=token");
});

test("unapproved stored sources never become a public native playback URL", () => {
  for (const stream_url of [
    "",
    "token-only",
    "javascript:bad",
    "https://example.test/private.mp4",
    "https://user:secret@example.test/video.m3u8",
  ]) {
    const result = episodePlayback({ id: 875, stream_url });
    expect(result.nativeSource).toBeNull();
    expect(result.hlsMasterUrl).toBeNull();
  }
});
