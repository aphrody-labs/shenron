// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

const records: Record<
  string,
  { id: number; title: string; image: string | null; number_in_series: number }[]
> = {
  DB: [{ id: 1, title: "First episode", image: "/wiki/episodes/1.webp", number_in_series: 1 }],
  DBS_BEERUS: [
    { id: 875, title: "Confirmed episode", image: "/wiki/episodes/875.webp", number_in_series: 1 },
  ],
};
let series = ["DB", "DBS_BEERUS"];
let sagasOpen = true;
mock.module("@/app/wiki/episodes/_shared", () => ({
  getEpisodeSeriesCached: async () =>
    series.map((code) => ({ series: code, count: records[code]?.length ?? 0 })),
  getEpisodesCached: async (code: string) => ({
    episodes: records[code] ?? [],
    total: records[code]?.length ?? 0,
  }),
  hasLang: () => false,
  orderSeries: (rows: { series: string }[]) => rows.map((row) => row.series),
  RAIL_CAP: 14,
  SERIES_LABELS: { DB: "Dragon Ball", DBS_BEERUS: "Dragon Ball Super: Beerus" },
  yearOf: () => null,
}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    sagas: async () => ({
      sagas: [
        { id: 2, slug: "pilaf", name: "Pilaf", series: "DB", image: "/wiki/sagas/pilaf.webp" },
      ],
    }),
  },
}));
mock.module("@/lib/assets", () => ({
  assetUrl: (path: string) => `https://cdn.dragonballfr.com${path}`,
}));
mock.module("@/lib/chronology", () => ({ eraOf: () => "DB", ERA_ACCENT: { DB: "#ff9900" } }));
mock.module("@/components/T", () => ({ T: ({ k }: { k: string }) => k }));
mock.module("@/components/wiki/WikiPageShell", () => ({
  WikiPageShell: ({
    title,
    lead,
    children,
  }: {
    title: ReactNode;
    lead: ReactNode;
    children: ReactNode;
  }) =>
    createElement(
      "main",
      null,
      createElement("h1", null, title),
      createElement("p", null, lead),
      children,
    ),
}));
mock.module("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
mock.module("@/components/GatedLink", () => ({
  GatedWrap: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    sagasOpen
      ? createElement("a", { href, ...props }, children)
      : createElement("div", { "aria-disabled": true, ...props }, children),
}));
mock.module("@/components/stream/StreamRail", () => ({
  StreamRail: ({ children }: { children: ReactNode }) => createElement("ul", null, children),
}));
mock.module("@/components/stream/EpisodeCard", () => ({
  EpisodeCard: ({ href, title, image }: { href: string; title: string; image: string }) =>
    createElement("a", { href, "data-image": image }, title),
}));
mock.module("@/components/history/ContinueRail", () => ({
  ContinueRail: () => createElement("aside", { id: "resume" }),
}));
mock.module("@/components/kit", () => ({ ContributeRail: () => null }));
mock.module("@/components/wiki/SectionUnavailable", () => ({
  SectionUnavailable: () => createElement("p", null, "Unavailable"),
}));

const { default: EpisodesCatalogue } = await import("../src/components/episodes/EpisodesCatalogue");

test("episodes and real sagas precede resume, with one series navigation and canonical Beerus links", async () => {
  series = ["DB", "DBS_BEERUS"];
  sagasOpen = true;
  const html = renderToStaticMarkup(await EpisodesCatalogue());
  expect(html.match(/<nav\b/g)).toHaveLength(1);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain('href="#episodes-DB"');
  expect(html).toContain('href="/wiki/sagas/pilaf"');
  expect(html).toContain('src="https://cdn.dragonballfr.com/wiki/sagas/pilaf.webp"');
  expect(html).toContain('href="/wiki/episodes/875"');
  expect(html).not.toContain("/DBS_BEERUS/131");
  expect(html.indexOf("/wiki/sagas/pilaf")).toBeLessThan(html.indexOf('id="resume"'));
  expect(html.indexOf('id="resume"')).toBeLessThan(html.indexOf("/sources/dragon-ball"));
});

test("closed saga navigation keeps the editorial card visible through the canonical guard", async () => {
  series = ["DB"];
  sagasOpen = false;
  try {
    const html = renderToStaticMarkup(await EpisodesCatalogue());
    expect(html).not.toContain('href="/wiki/sagas/pilaf"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Pilaf");
    expect(html).toContain("/wiki/sagas/pilaf.webp");
  } finally {
    sagasOpen = true;
  }
});

test("missing editorial series do not fabricate Beerus records", async () => {
  series = ["DB"];
  const html = renderToStaticMarkup(await EpisodesCatalogue());
  expect(html).not.toContain("DBS_BEERUS");
  expect(html).not.toContain("/wiki/episodes/875");
});

test("all catalogue interface keys exist in each dictionary", () => {
  for (const dictionary of [fr, en, ja]) {
    expect(dictionary.wiki.episodes.title).toBeTruthy();
    expect(dictionary.wiki.episodes.metaEpisodes).toBeTruthy();
    expect(dictionary.wiki.episodes.metaSeries).toBeTruthy();
    expect(dictionary.common.viewAll).toBeTruthy();
    expect(dictionary.categories.sagas.label).toBeTruthy();
    expect(dictionary.catalog.categories.sources).toBeTruthy();
  }
});
