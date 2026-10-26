// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import type { Game } from "@/lib/db-universe";
import { cleanExcerpt, matchPlatform, selectGames } from "../src/lib/games-catalogue";

function game(id: number, data: Partial<Game> = {}): Game {
  return {
    id,
    slug: `game-${id}`,
    title: `Game ${id}`,
    title_ja: null,
    platforms: null,
    release_date: null,
    developer: null,
    publisher: null,
    description: null,
    cover: null,
    official_url: null,
    media: [],
    ...data,
  };
}
const defaults = { query: "", platform: "all", sort: "date-desc", locale: "fr" } as const;

test("platform families recognize console aliases without substring false positives", () => {
  for (const platform of ["PS5", "PlayStation 2", "PS Vita", "PSX", "PS One", "PSP"])
    expect(matchPlatform(platform, "playstation")).toBe(true);
  for (const platform of [
    "Nintendo 64",
    "GameBoy Color",
    "GBC",
    "DS",
    "3DS",
    "SNES",
    "Switch 2",
    "Wii U",
  ])
    expect(matchPlatform(platform, "nintendo")).toBe(true);
  for (const platform of ["Sega Genesis", "Windows", "PC", "Android", "Arcade"])
    expect(matchPlatform(platform, "nintendo")).toBe(false);
  expect(matchPlatform("PC Engine", "pc")).toBe(false);
  expect(matchPlatform("PC Engine, PC", "pc")).toBe(true);
  expect(matchPlatform("Windows, Steam", "pc")).toBe(true);
  expect(matchPlatform("iOS, Android", "mobile")).toBe(true);
  for (const platform of ["Xbox Series X/S", "Xbox Series X|S", "XSX", "XSS", "XBO", "X360", "XB1"])
    expect(matchPlatform(platform, "xbox")).toBe(true);
  expect(matchPlatform("XBOAT", "xbox")).toBe(false);
  expect(matchPlatform("Arcade", "arcade")).toBe(true);
  expect(matchPlatform(null, "all")).toBe(true);
  expect(matchPlatform(null, "pc")).toBe(false);
});

test("search folds accents and matches Japanese, studio and platforms while combining filters", () => {
  const games = [
    game(1, { title: "L’Épopée", platforms: "PC", developer: "Équipe", title_ja: "悟空の冒険" }),
    game(2, { title: "Épopée Mobile", platforms: "Android", publisher: "Bandai" }),
  ];
  for (const query of ["epopee", "ÉPOPÉE", "e\u0301pope\u0301e"])
    expect(
      selectGames(games, {}, { ...defaults, query })
        .map((entry) => entry.id)
        .toSorted(),
    ).toEqual([1, 2]);
  for (const query of ["equipe", "悟空", "PC"])
    expect(selectGames(games, {}, { ...defaults, query }).map((entry) => entry.id)).toEqual([1]);
  expect(selectGames(games, {}, { ...defaults, query: "bandai", platform: "pc" })).toEqual([]);
  expect(selectGames(games, {}, { ...defaults, query: "  " })).toHaveLength(2);
});

test("missing and invalid dates stay after known dates in both chronological directions", () => {
  const games = [
    game(1),
    game(2, { release_date: 200 }),
    game(3, { release_date: 100 }),
    game(4, { release_date: NaN }),
  ];
  expect(selectGames(games, {}, defaults).map((entry) => entry.id)).toEqual([2, 3, 1, 4]);
  expect(
    selectGames(games, {}, { ...defaults, sort: "date-asc" }).map((entry) => entry.id),
  ).toEqual([3, 2, 1, 4]);
});

test("fan sorting uses real votes and deterministic tie breakers", () => {
  const games = [game(4), game(3, { release_date: 200 }), game(2, { release_date: 100 }), game(1)];
  const ratings = {
    "1": { average: 5, count: 0 },
    "2": { average: 4, count: 20 },
    "3": { average: 4, count: 20 },
    "4": { average: 4, count: 50 },
  };
  expect(
    selectGames(games, ratings, { ...defaults, sort: "rating-desc" }).map((entry) => entry.id),
  ).toEqual([4, 3, 2, 1]);
});

test("alphabetic sorting follows the requested locale and leaves all input data unchanged", () => {
  const games = [
    game(3, { title: "Zorro" }),
    game(2, { title: "Ärger" }),
    game(1, { title: "Ärger" }),
  ];
  const snapshot = structuredClone(games);
  const french = selectGames(games, {}, { ...defaults, sort: "title-asc" });
  const swedish = selectGames(games, {}, { ...defaults, sort: "title-asc", locale: "sv" });
  expect(french.map((entry) => entry.id)).toEqual([1, 2, 3]);
  expect(swedish.map((entry) => entry.id)).toEqual([3, 1, 2]);
  expect(games).toEqual(snapshot);
  expect(french).not.toBe(games);
  expect(french[0]).toBe(games[2]);
});

test("excerpts remove source annotations and formatting without leaking missing values", () => {
  expect(cleanExcerpt(null)).toBe("");
  expect(cleanExcerpt(" **Le jeu**\n _(Source : édition papier)_   arrive. ")).toBe(
    "Le jeu arrive.",
  );
  expect(cleanExcerpt("Un long récit", 7)).toBe("Un long…");
});
