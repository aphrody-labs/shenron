// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  streamingEpisode,
  streamingFeature,
  type StreamingGroup,
} from "../src/lib/streaming-catalogue";
import type { Episode } from "../src/lib/db-universe";
import fr from "../messages/streaming/fr.json";
import en from "../messages/streaming/en.json";
import ja from "../messages/streaming/ja.json";

const source = {
  id: 876,
  series: "DBS_BEERUS",
  number_in_series: 2,
  title: "Beerus",
  title_ja: null,
  image: "/wiki/beerus.webp",
  synopsis: "An adventure. (Source: ANN)",
  air_date: 1767225600,
  players: [
    { lang: "vostfr", embedUrl: "https://example.com/private", provider: "cdn", name: "CDN" },
  ],
  stream_url: "https://example.com/token",
  subtitles: [],
  availability: [],
} as unknown as Episode;
describe("streaming catalogue projection", () => {
  test("retains editorial identity while excluding transport URLs", () => {
    const episode = streamingEpisode(source);
    expect(episode).toMatchObject({
      id: 876,
      number: 2,
      year: 2026,
      languages: ["vostfr"],
      hasPlayback: true,
      synopsis: "An adventure.",
    });
    expect(JSON.stringify(episode)).not.toContain("example.com");
    expect(streamingEpisode({ ...source, players: null, stream_url: null }).hasPlayback).toBe(
      false,
    );
  });
  test("spotlight excludes unplayable entries and entries without artwork", () => {
    const episode = streamingEpisode(source);
    const group = {
      series: source.series,
      label: "Beerus",
      total: 3,
      sagas: [],
      episodes: [
        episode,
        { ...episode, id: 877, year: 2027, hasPlayback: false },
        { ...episode, id: 878, year: 2028, image: null },
      ],
    } satisfies StreamingGroup;
    expect(streamingFeature([group])?.id).toBe(876);
    expect(streamingFeature([])).toBeNull();
  });
  test("all interface keys and interpolations exist in all three locales", () => {
    for (const dictionary of [en, ja]) {
      expect(Object.keys(dictionary).toSorted()).toEqual(Object.keys(fr).toSorted());
      for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
        expect(dictionary[key].length).toBeGreaterThan(0);
        expect(dictionary[key].match(/\{\w+\}/g)).toEqual(fr[key].match(/\{\w+\}/g));
      }
    }
  });
});
