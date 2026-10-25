// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Soundtrack } from "../src/lib/db-universe";
import { EPISODE_SERIES_LABELS, episodeSeriesHref } from "../src/lib/episode-series-links";

test("soundtrack labels point to canonical catalogue codes", () => {
  for (const [code, label] of Object.entries(EPISODE_SERIES_LABELS)) {
    expect(episodeSeriesHref(label)).toBe(`/wiki/episodes/series/${code}`);
    expect(episodeSeriesHref(code.toLowerCase())).toBe(`/wiki/episodes/series/${code}`);
  }
  expect(episodeSeriesHref("Dragon Ball Kai")).toBe("/wiki/episodes/series/DBZ_KAI");
  expect(episodeSeriesHref("SDBH")).toBe("/wiki/episodes/series/SDBH");
  expect(episodeSeriesHref("Super Dragon Ball Heroes")).toBe("/wiki/episodes/series/SDBH");
  expect(episodeSeriesHref("  dragon   ball SUPER ")).toBe("/wiki/episodes/series/DBS");
});

test("unknown series names never generate nonexistent routes", () => {
  for (const value of ["", "Unknown series", "Dragon Ball /../../admin", "DBZ extra"]) {
    expect(episodeSeriesHref(value)).toBeNull();
  }
});

mock.module("@/components/T", () => ({ useT: () => (key: string) => key }));
mock.module("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
const { SoundtracksGrid } = await import("../src/components/wiki/SoundtracksGrid");

test("soundtrack cards render the shared destinations and keep unknown labels visible", () => {
  const labels = [
    "Dragon Ball",
    "Dragon Ball GT",
    "Dragon Ball Super",
    "Dragon Ball Z",
    "Dragon Ball Kai",
    "Dragon Ball Daima",
    "Unlisted soundtrack series",
  ];
  const tracks = labels.map((series, id) => ({
    id,
    slug: `track-${id}`,
    series,
    title: `Track ${id}`,
    artist: "Artist",
    track_type: "opening",
  })) as Soundtrack[];
  const html = renderToStaticMarkup(createElement(SoundtracksGrid, { soundtracks: tracks }));
  for (const code of ["DB", "DBGT", "DBS", "DBZ", "DBZ_KAI", "DB_DAIMA"]) {
    expect(html).toContain(`href="/wiki/episodes/series/${code}"`);
  }
  expect(html).toContain("Unlisted soundtrack series</span>");
  expect(html).not.toContain('href="/wiki/episodes/series/dragon');
});
