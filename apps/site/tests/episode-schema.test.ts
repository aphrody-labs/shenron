// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import type { Episode } from "../src/lib/db-universe";
import { buildEpisodeSchema } from "../src/lib/episode-schema";

const HASH = "a".repeat(64);
const cdnVideo = `https://cdn.dragonballfr.com/media/episodes/875/${HASH}/source.mp4`;

function episode(overrides: Partial<Episode>): Episode {
  return {
    id: 875,
    series: "DBS_BEERUS",
    number_in_series: 1,
    arc_id: null,
    title: "Episode",
    title_ja: null,
    air_date: null,
    synopsis: null,
    official_source_url: null,
    image: null,
    video_url: null,
    mal_id: null,
    subtitles: null,
    players: null,
    availability: null,
    stream_url: null,
    frames: null,
    scene_preview: null,
    ...overrides,
  };
}

const offer = {
  provider: "adn",
  label: "ADN",
  url: "https://animationdigitalnetwork.com/video/dragon-ball-super/1",
  embedUrl: null,
  langs: ["vostfr" as const],
  available: true,
  checkedAt: 100,
};

const build = (overrides: Partial<Episode>) =>
  buildEpisodeSchema(episode(overrides), { seriesLabel: "Dragon Ball Super" });

test("an available https offer becomes one WatchAction with the exact URL", () => {
  const schema = build({ availability: [offer] });
  expect(schema.potentialAction).toEqual([{ "@type": "WatchAction", target: offer.url }]);
});

test("unavailable and non-https offers are skipped", () => {
  const schema = build({
    availability: [
      { ...offer, available: false },
      { ...offer, provider: "plain", url: "http://provider.example/ep" },
    ],
  });
  expect(schema).not.toHaveProperty("potentialAction");
});

test("only first-party episode videos reach video.contentUrl", () => {
  for (const url of [
    "https://27.mugiwara.one/dbs/dbs-1.mp4",
    "https://vidmoly.to/embed-abc.html",
  ]) {
    expect(build({ video_url: url })).not.toHaveProperty("video");
    expect(build({ stream_url: url })).not.toHaveProperty("video");
  }
  const kept = build({ video_url: "https://vidmoly.to/embed-abc.html", stream_url: cdnVideo });
  expect(kept.video).toMatchObject({ "@type": "VideoObject", contentUrl: cdnVideo });
  expect(build({ video_url: cdnVideo }).video).toMatchObject({ contentUrl: cdnVideo });
});
