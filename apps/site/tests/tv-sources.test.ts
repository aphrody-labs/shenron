// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { tvSourcesForEpisode } from "../src/lib/tv-sources";

const hash = "b".repeat(64);
const empty = { video_url: null, stream_url: null, players: [] };

test("an episode with a CDN hash path returns one direct source", () => {
  const url = `https://cdn.dragonballfr.com/media/episodes/876/${hash}/source.mp4`;
  const sources = tvSourcesForEpisode({ ...empty, id: 876, stream_url: url });
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({ type: "direct", url });
});

test("third-party players and foreign direct URLs yield no source", () => {
  const sources = tvSourcesForEpisode({
    id: 12,
    video_url: "https://example.com/episode.mp4",
    stream_url: "https://27.mugiwara.one/dbs/dbs-1.mp4",
    players: [
      { embedUrl: "https://vidmoly.biz/embed-abc.html" },
      { embedUrl: "https://www.yourupload.com/embed/abc" },
      { embedUrl: "https://my.mail.ru/video/embed/abc" },
      { embedUrl: "https://27.mugiwara.one/dbs/dbs-2.mp4" },
      {},
    ],
  });
  expect(sources).toEqual([]);
});

test("a CDN URL of another episode is rejected", () => {
  const url = `https://cdn.dragonballfr.com/media/episodes/877/${hash}/source.mp4`;
  expect(tvSourcesForEpisode({ ...empty, id: 876, video_url: url })).toEqual([]);
});

test("episode 875 accepts the beerus-01 optimized MP4", () => {
  const url = "https://cdn.dragonballfr.com/media/episodes/beerus-01/optimized-720p.mp4";
  const sources = tvSourcesForEpisode({ ...empty, id: 875, players: [{ embedUrl: url }] });
  expect(sources.map((s) => s.url)).toEqual([url]);
  expect(tvSourcesForEpisode({ ...empty, id: 12, video_url: url })).toEqual([]);
});
