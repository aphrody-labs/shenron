// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

let locale: "fr" | "en" | "ja" = "fr";
const dictionaries = { fr, en, ja };
mock.module("next-intl", () => ({
  useLocale: () => locale,
  useTranslations: (namespace: string) =>
    createTranslator({ locale, messages: dictionaries[locale], namespace } as never),
}));
mock.module("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
const { filterSeriesEpisodes, EpisodeSeriesGrid } =
  await import("../src/app/wiki/episodes/series/[series]/EpisodeSeriesGrid");
const { dbsBeerusEpisodeCard, DBS_BEERUS_SERIES_CODE } =
  await import("../src/lib/episode-series-catalogue");
const { DbsBeerusSpotlight } = await import("../src/components/home/DbsBeerusSpotlight");

test("the compact spotlight uses the official logo in the reader language", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(createElement(DbsBeerusSpotlight, { compact: true }));
    expect(html).toContain(`/official/beerus/logo-${locale === "ja" ? "ja" : "en"}.webp`);
    expect(html).toContain("official-beerus-info");
    expect(html).toContain('width="1233" height="563"');
    expect(html).not.toContain('rel="preload" as="image"');
  }
  locale = "fr";
});
const episodes = [
  {
    id: 447,
    number: 3,
    title: "Le rêve du Super Saiyan",
    titleJa: null,
    hasVf: true,
    hasVostfr: true,
  },
  {
    id: 641,
    number: 120,
    title: "Les assassins de l’univers 3",
    titleJa: null,
    hasVf: true,
    hasVostfr: false,
  },
  { id: 642, number: 121, title: "L’univers 3", titleJa: null, hasVf: false, hasVostfr: true },
  {
    id: 900,
    number: null,
    title: "Épisode 3 non numéroté",
    titleJa: "破壊神",
    hasVf: false,
    hasVostfr: false,
  },
] as Parameters<typeof filterSeriesEpisodes>[0];

test("exact episode search excludes numbered titles and unestablished numbers", () => {
  expect(filterSeriesEpisodes(episodes, "3", "all").map((e) => e.id)).toEqual([447]);
  expect(filterSeriesEpisodes(episodes, "003", "vostfr").map((e) => e.id)).toEqual([447]);
  expect(filterSeriesEpisodes(episodes, "120", "vostfr")).toEqual([]);
  expect(filterSeriesEpisodes(episodes, "univers", "all").map((e) => e.id)).toEqual([641, 642]);
  expect(filterSeriesEpisodes(episodes, "EPISODE", "all").map((e) => e.id)).toEqual([900]);
  expect(filterSeriesEpisodes(episodes, "破壊神", "all").map((e) => e.id)).toEqual([900]);
});

test("the 2026 page separates the original 131 episodes and links the new episode to its official listing", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(createElement(DbsBeerusSpotlight, { catalogue: true }));
    expect(html).toContain(dictionaries[locale].dbsBeerus.title);
    expect(html).toContain(dictionaries[locale].dbsBeerus.catalogueNote);
    expect(html).toContain(dictionaries[locale].dbsBeerus.episodeOne);
    expect(html).toContain(
      'href="https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys"',
    );
    expect(html).toContain(dictionaries[locale].dbsBeerus.watchEpisode);
    expect(html).toContain(dictionaries[locale].dbsBeerus.openLocalEpisode);
    expect(html).toContain("/news/dragon-ball-super-beerus-adn-vostfr-18h-2026-10-11");
    expect(html).toContain(`href="https://dragonball-super.com/${locale === "ja" ? "" : "en/"}"`);
    expect(html).not.toContain("<video");
    expect(html).toContain("dbs-beerus-2026.jpg");
    expect(html).toContain('src="/banners/dbs-beerus-2026.jpg"');
    expect(html).toContain('rel="preload" as="image"');
    expect(html).not.toContain("youtube-nocookie.com/embed/");
    expect(html).not.toContain("Beerus_DBS_Broly_Artwork.webp");
    expect(html).not.toContain("/wiki/episodes/445");
  }
  locale = "fr";
});

test("the confirmed 2026 episode has its own local episode route and no fabricated database id", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    const episode = dbsBeerusEpisodeCard(dictionaries[locale].dbsBeerus.episodeTitle);
    expect(DBS_BEERUS_SERIES_CODE).toBe("DBS_BEERUS");
    expect(episode.id).toBe("DBS_BEERUS:1");
    expect(episode.number).toBe(1);
    expect(episode.href).toBe("/wiki/episodes/875");
    expect(episode.title).toBe(dictionaries[locale].dbsBeerus.episodeTitle);
    expect(dictionaries[locale].dbsBeerus.episodeContinuity).toContain("2015");
    expect(dictionaries[locale].dbsBeerus.episodeContinuity).toContain("2018");
    expect(dictionaries[locale].dbsBeerus.episodeContinuity).not.toContain("131");
  }
  locale = "fr";
});

const { OfficialBeerusCard } = await import("../src/app/wiki/episodes/OfficialBeerusCard");
test("official metadata rail changes its visible and accessible title with the reader locale", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(createElement(OfficialBeerusCard));
    expect(html).toContain(dictionaries[locale].dbsBeerus.episodeTitle);
    expect(html).toContain("/wiki/episodes/875");
    expect(html).not.toContain("<video");
    for (const other of ["fr", "en", "ja"] as const) {
      if (other !== locale) expect(html).not.toContain(dictionaries[other].dbsBeerus.episodeTitle);
    }
  }
  locale = "fr";
});

test("official metadata grid localizes title and synopsis without introducing player availability", () => {
  const episode = {
    id: "DBS_BEERUS:1",
    href: "/wiki/episodes/875",
    number: 1,
    title: fr.dbsBeerus.episodeTitle,
    titleJa: null,
    image: null,
    synopsis: fr.dbsBeerus.episodeSynopsis,
    year: 2026,
    hasVf: false,
    hasVostfr: false,
    playerCount: 0,
  };
  for (locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(createElement(EpisodeSeriesGrid, { episodes: [episode] }));
    expect(html).toContain(dictionaries[locale].dbsBeerus.episodeTitle);
    expect(html).toContain(dictionaries[locale].dbsBeerus.episodeSynopsis);
    expect(html).not.toContain("<video");
  }
  locale = "fr";
});
