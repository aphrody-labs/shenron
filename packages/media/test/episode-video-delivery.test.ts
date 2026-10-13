// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { episodeVideoPatch, type EpisodeVideoDelivery } from "../src/episode-video-delivery";

const sourceSha256 = "a".repeat(64);
const expected = {
  episodeId: 875,
  sourceUrl: "https://dragonballfr.com/api/episodes/875/video",
  sourceSha256,
  publicAssetOrigin: "https://cdn.dragonballfr.com",
};
const delivery = (): EpisodeVideoDelivery => ({
  producer: "bun-video",
  episodeId: 875,
  source: { url: expected.sourceUrl, sha256: sourceSha256, bytes: 681525411 },
  video: { width: 1920, height: 1080, durationSeconds: 1397.688 },
  frames: [
    {
      url: "https://cdn.dragonballfr.com/episodes/875/frame-001.png",
      sha256: "b".repeat(64),
      bytes: 1200000,
      width: 1920,
      height: 1080,
      timecodeSeconds: 101,
      format: "png",
    },
  ],
});

test("producer metadata reaches supported fields without claiming extraction or selectable burned-in captions", () => {
  const result = episodeVideoPatch(delivery(), expected);
  expect(result.patch.durationSec).toBe(1397);
  expect(result.provenance.video.durationSeconds).toBe(1397.688);
  expect(result.patch.frames[0]?.source).toBe("bun-video");
  expect(result.patch.frames[0]?.width).toBe(1920);
  expect(result.patch).not.toHaveProperty("subtitles");
  expect(result.patch).not.toHaveProperty("hasVostfr");
  expect(result.provenance.extractionPerformed).toBe(false);
  expect(result.provenance.reencodingPerformed).toBe(false);
});

test("intake rejects another episode, another source, resized or lossy artifacts and invalid frame times", () => {
  for (const change of [
    (v: EpisodeVideoDelivery) => {
      v.episodeId = 450;
    },
    (v: EpisodeVideoDelivery) => {
      v.source.sha256 = "c".repeat(64);
    },
    (v: EpisodeVideoDelivery) => {
      v.frames[0]!.width = 1280;
    },
    (v: EpisodeVideoDelivery) => {
      v.frames[0]!.url = "https://cdn.dragonballfr.com/frames/a.jpg";
    },
    (v: EpisodeVideoDelivery) => {
      v.frames[0]!.timecodeSeconds = 1397.688;
    },
    (v: EpisodeVideoDelivery) => {
      v.frames.push({ ...v.frames[0]! });
    },
    (v: EpisodeVideoDelivery) => {
      v.frames[0]!.url = "https://foreign.example/a.png";
    },
  ]) {
    const input = delivery();
    change(input);
    expect(() => episodeVideoPatch(input, expected)).toThrow();
  }
});

test("private producer fields never enter editorial patches or public provenance", () => {
  const input = delivery();
  Object.assign(input.source, { privateRef: "protected-source-path", cookies: "private-cookie" });
  Object.assign(input.frames[0]!, { privatePath: "protected-frame-path" });
  const value = JSON.stringify(episodeVideoPatch(input, expected));
  expect(value).not.toContain("protected-");
  expect(value).not.toContain("private-cookie");
  expect(value).not.toContain("privateRef");
});

test("only normalized external WebVTT assets become selectable subtitle tracks", () => {
  const input = delivery();
  input.subtitles = [
    {
      url: "https://cdn.dragonballfr.com/episodes/875/fr.vtt",
      language: "fr",
      label: "French",
      sha256: "d".repeat(64),
    },
  ];
  expect(episodeVideoPatch(input, expected).patch.subtitles?.[0]?.lang).toBe("fr");
  input.subtitles[0]!.url = "https://cdn.dragonballfr.com/episodes/875/fr.ass";
  expect(() => episodeVideoPatch(input, expected)).toThrow();
});
