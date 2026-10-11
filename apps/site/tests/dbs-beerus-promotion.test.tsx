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
  useTranslations: (namespace: string) =>
    createTranslator({ locale, messages: dictionaries[locale], namespace } as never),
}));
mock.module("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
const { filterSeriesEpisodes } =
  await import("../src/app/wiki/episodes/series/[series]/EpisodeSeriesGrid");
const { DbsBeerusSpotlight } = await import("../src/components/home/DbsBeerusSpotlight");
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

test("the 2026 promotion links editorial and official sources without presenting an episode player", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(createElement(DbsBeerusSpotlight, { catalogue: true }));
    expect(html).toContain(dictionaries[locale].dbsBeerus.title);
    expect(html).toContain(dictionaries[locale].dbsBeerus.catalogueNote);
    expect(html).toContain("/news/dragon-ball-super-beerus-adn-vostfr-18h-2026-10-11");
    expect(html).toContain('href="https://dragonball-super.com/en/"');
    expect(html).toContain(dictionaries[locale].dbsBeerus.originalVideoNote);
    expect(html).toContain(
      "/assets/video/9cd332d95dedde18175eca4b394d9923a59669fb301a0caf0d1b2723f15034b3/poster.png",
    );
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("/wiki/episodes/445");
  }
  locale = "fr";
});
