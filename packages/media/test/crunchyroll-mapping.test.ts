// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  crunchyrollLangs,
  crunchyrollWatchUrl,
  mapCrunchyrollEpisodes,
} from "../src/crunchyroll-mapping";

test("watch URLs are built from the id and a sanitized slug", () => {
  expect(crunchyrollWatchUrl("GE00389313JAJP", "the-god-who-destroys")).toBe(
    "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys",
  );
  expect(crunchyrollWatchUrl("GE00389313JAJP", "../x y")).toBe(
    "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/x-y",
  );
  expect(() => crunchyrollWatchUrl("bad id", "x")).toThrow();
});

test("languages are claimed only from audio and subtitle locales", () => {
  expect(
    crunchyrollLangs({
      id: "GE00389313JAJP",
      audio_locale: "ja-JP",
      subtitle_locales: ["fr-FR", "en-US"],
    }),
  ).toEqual(["vostfr"]);
  expect(
    crunchyrollLangs({ id: "GE00389313JAJP", audio_locale: "ja-JP", subtitle_locales: ["en-US"] }),
  ).toEqual(["vost"]);
  expect(
    crunchyrollLangs({ id: "GE00389313FRFR", audio_locale: "fr-FR", subtitle_locales: [] }),
  ).toEqual(["vf"]);
  expect(crunchyrollLangs({ id: "GE00389313JAJP" })).toEqual([]);
});

test("one entry per number, preferring the Japanese original over a dub", () => {
  const mapped = mapCrunchyrollEpisodes(
    [
      {
        id: "GE00389313FRFR",
        episode_number: 1,
        slug_title: "dub",
        audio_locale: "fr-FR",
        duration_ms: 1_400_000,
      },
      {
        id: "GE00389313JAJP",
        episode_number: 1,
        slug_title: "the-god-who-destroys",
        audio_locale: "ja-JP",
        subtitle_locales: ["fr-FR"],
        duration_ms: 1_397_000,
        title: "The God Who Destroys",
      },
      {
        id: "GE00389314JAJP",
        sequence_number: 2,
        audio_locale: "ja-JP",
        subtitle_locales: ["fr-FR"],
      },
      { id: "x", episode_number: 3 },
    ],
    1000,
  );
  expect(mapped.map((e) => [e.number, e.crunchyrollId])).toEqual([
    [1, "GE00389313JAJP"],
    [2, "GE00389314JAJP"],
  ]);
  expect(mapped[0]!.availability).toMatchObject({ langs: ["vostfr"], checkedAt: 1000 });
  expect(mapped[0]!.durationSec).toBe(1397);
});

import {
  crunchyrollOffer,
  crunchyrollSeriesSummary,
  resolveCrunchyroll,
} from "../src/crunchyroll-mapping";

const rows = [
  {
    id: 875,
    series: "DBS_BEERUS",
    number_in_series: 1,
    title: "A",
    availability: [
      {
        provider: "crunchyroll",
        url: "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys",
        langs: ["vostfr"],
        available: true,
        checkedAt: 5,
      },
    ],
  },
  { id: 876, series: "DBS_BEERUS", number_in_series: 2, title: "B", availability: null },
  {
    id: 5,
    series: "DBS",
    number_in_series: 5,
    title: "C",
    availability: [{ provider: "crunchyroll", url: "https://evil.example/watch/GE0000000AAAA/x" }],
  },
];

test("only crunchyroll.com watch links count as offers", () => {
  expect(crunchyrollOffer(rows[0]!)).toMatchObject({
    crunchyrollId: "GE00389313JAJP",
    langs: ["vostfr"],
    checkedAt: 5,
  });
  expect(crunchyrollOffer(rows[1]!)).toBeNull();
  expect(crunchyrollOffer(rows[2]!)).toBeNull();
});

test("resolver finds an offer by episode id, series and number, or Crunchyroll id", () => {
  expect(resolveCrunchyroll(rows, { episode: 875 })?.episodeId).toBe(875);
  expect(resolveCrunchyroll(rows, { series: "DBS_BEERUS", number: 1 })?.crunchyrollId).toBe(
    "GE00389313JAJP",
  );
  expect(resolveCrunchyroll(rows, { crunchyroll: "GE00389313JAJP" })?.episodeId).toBe(875);
  expect(resolveCrunchyroll(rows, { episode: 876 })).toBeNull();
});

test("series summary reports the mapped share", () => {
  expect(crunchyrollSeriesSummary("DBS_BEERUS", rows)).toMatchObject({
    crunchyrollSeries: "GT00389311",
    episodes: 2,
    mapped: 1,
    crunchyrollUrl: "https://www.crunchyroll.com/fr/series/GT00389311",
  });
});
