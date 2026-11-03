import { expect, test } from "bun:test";
import { buildWikiSearchSections, isPublicWikiSearchHref } from "../src/lib/wiki-search-catalogue";
import type { SearchResults } from "../src/lib/db-universe";
import { DEFAULT_LAUNCH_CONFIG } from "@aphrody/shenron-config/wiki-launch-config";

function empty(): SearchResults {
  return {
    q: "Namek",
    characters: [],
    planets: [],
    races: [],
    transformations: [],
    techniques: [],
    sagas: [],
    arcs: [],
    movies: [],
    episodes: [],
    games: [],
    mangaVolumes: [],
    mangaChapters: [],
    battles: [],
    locations: [],
    tournaments: [],
    voiceActors: [],
    soundtracks: [],
    powerLevels: [],
    items: [],
    dragons: [],
    databooks: [],
    novels: [],
    contributors: [],
  };
}

test("results in secondary catalogues are counted and reachable instead of showing an empty search", () => {
  const results = empty();
  results.battles = [{ id: 1, slug: "namek", name: "Namek", name_ja: null, saga: "Freezer" }];
  results.soundtracks = [
    { id: 2, slug: "theme", title: "Theme", title_ja: null, track_type: "opening", series: "DBZ" },
  ];
  results.items = [
    {
      id: 3,
      slug: "dragon-radar",
      name: "Dragon Radar",
      name_ja: null,
      category: "technology",
      image: "./assets/wiki/items/radar.png",
    },
  ];
  const sections = buildWikiSearchSections(results, null);
  expect(sections.reduce((n, section) => n + section.entries.length, 0)).toBe(3);
  expect(sections.find((section) => section.key === "items")?.entries[0]?.href).toBe(
    "/wiki/items/dragon-radar",
  );
  expect(sections.find((section) => section.key === "items")?.entries[0]?.image).toBe(
    "./assets/wiki/items/radar.png",
  );
});

test("closed destinations remain absent even when a search service returns their rows", () => {
  const results = empty();
  results.items = [
    { id: 3, slug: "radar", name: "Radar", name_ja: null, category: "technology", image: null },
  ];
  expect(buildWikiSearchSections(results, structuredClone(DEFAULT_LAUNCH_CONFIG))).toEqual([]);
});

test("nameless volumes retain a useful bibliographic title and a real reader destination", () => {
  const results = empty();
  results.mangaVolumes = [{ id: 10, series: "DB", volume_number: 4, title: null, cover: null }];
  const entry = buildWikiSearchSections(results, null)[0]!.entries[0]!;
  expect(entry.title).toBe("DB · 4");
  expect(entry.href).toBe("/wiki/manga/volume/10");
});

test("a transformation result opens its own entry rather than the character catalogue", () => {
  const results = empty();
  results.transformations = [{ id: 1, name: "Super Saiyan", image: null, character_id: 1 }];
  const entry = buildWikiSearchSections(results, null)[0]!.entries[0]!;
  expect(entry.href).toStartWith("/wiki/transformations/");
});

test("access checks normalize query strings and owned absolute source links", () => {
  const access = { openKeys: ["staff"] };
  expect(isPublicWikiSearchHref("/wiki/staff?tier=voice", access)).toBe(true);
  expect(isPublicWikiSearchHref("https://dragonballfr.com/wiki/techniques/x", access)).toBe(false);
  expect(isPublicWikiSearchHref("/wiki/techniques/x", access)).toBe(false);
});

test("dragons retain their precise ledger anchors", () => {
  const results = empty();
  results.dragons = [
    { id: 1, slug: "shenron", name: "Shenron", name_ja: null, creator: null, image: null },
  ];
  expect(buildWikiSearchSections(results, null)[0]!.entries[0]!.href).toBe("/wiki/dragons#shenron");
});
