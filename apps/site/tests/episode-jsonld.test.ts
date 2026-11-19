// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { episodeJsonLd, isoDuration, type EpisodeJsonLdInput } from "../src/lib/episode-jsonld";

const options = { seriesLabel: "Dragon Ball Super", siteUrl: "https://dragonballfr.com/" };
const row: EpisodeJsonLdInput = {
  id: 445,
  series: "DBS",
  number_in_series: 3,
  title: "Titre",
  title_ja: "タイトル",
  synopsis: "Un **résumé**.",
  image: null,
  air_date: 1_437_264_000,
  video_url: null,
  stream_url: null,
  duration_sec: 1397,
};

test("canonical fields come from the catalogue row", () => {
  const schema = episodeJsonLd(row, options);
  expect(schema.url).toBe("https://dragonballfr.com/wiki/episodes/445");
  expect(schema.episodeNumber).toBe("3");
  expect(schema.alternateName).toBe("タイトル");
  expect(schema.description).toBe("Un résumé.");
  expect(schema.inLanguage).toBe("fr");
  expect(schema.datePublished).toBe("2015-07-19T00:00:00.000Z");
  expect(schema.partOfSeries).toEqual({
    "@type": "TVSeries",
    name: "Dragon Ball Super",
    url: "https://dragonballfr.com/wiki/episodes/series/DBS",
  });
  expect("video" in schema).toBe(false);
});

test("a null number omits episodeNumber, as does a non-positive one", () => {
  expect("episodeNumber" in episodeJsonLd({ ...row, number_in_series: null }, options)).toBe(false);
  expect("episodeNumber" in episodeJsonLd({ ...row, number_in_series: 0 }, options)).toBe(false);
});

test("a null air_date omits datePublished", () => {
  expect("datePublished" in episodeJsonLd({ ...row, air_date: null }, options)).toBe(false);
});

test("durations are ISO 8601", () => {
  expect(episodeJsonLd(row, options).duration).toBe("PT23M17S");
  expect(isoDuration(3725)).toBe("PT1H2M5S");
  expect(isoDuration(null)).toBeUndefined();
  expect(isoDuration(0)).toBeUndefined();
  expect("duration" in episodeJsonLd({ ...row, duration_sec: null }, options)).toBe(false);
});

test("a Japanese title equal to the title is not repeated", () => {
  expect("alternateName" in episodeJsonLd({ ...row, title_ja: row.title }, options)).toBe(false);
  expect("alternateName" in episodeJsonLd({ ...row, title_ja: null }, options)).toBe(false);
  expect("alternateName" in episodeJsonLd({ ...row, title_ja: "  " }, options)).toBe(false);
});

test("the Beerus special route and /875 describe the same episode", () => {
  const beerus: EpisodeJsonLdInput = {
    ...row,
    id: 875,
    series: "DBS_BEERUS",
    number_in_series: 1,
    air_date: 1_791_676_800,
    video_url: "https://cdn.dragonballfr.com/media/episodes/875/master.m3u8",
  };
  const label = { ...options, seriesLabel: "Dragon Ball Super: Beerus" };
  const special = episodeJsonLd(beerus, label);
  const canonical = episodeJsonLd(beerus, label);
  expect(special).toEqual(canonical);
  expect(special.name).toBe(canonical.name);
  expect(special.partOfSeries).toEqual(canonical.partOfSeries);
  expect(special.url).toBe("https://dragonballfr.com/wiki/episodes/875");
  expect(special.video).toMatchObject({ contentUrl: beerus.video_url, duration: "PT23M17S" });
});
