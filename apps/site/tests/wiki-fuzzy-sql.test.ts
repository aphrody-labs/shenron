// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, getTableColumns } from "drizzle-orm";
import * as botSchema from "@aphrody/shenron-db/bot-schema";
import { escapeRegex, fuzzyOrder, wholeWordPattern } from "../src/lib/wiki-fuzzy-sql";

const db = drizzle.mock();
const cols = [botSchema.botCharacters.name, botSchema.botCharacters.nameJa];

function orderBySql(term: string) {
  return db
    .select({ id: botSchema.botCharacters.id })
    .from(botSchema.botCharacters)
    .orderBy(...fuzzyOrder(term, cols))
    .toSQL();
}

describe("fuzzyOrder", () => {
  test("emits the six tiers in order", () => {
    const { sql } = orderBySql("goku");
    const orderBy = sql.slice(sql.indexOf("order by"));
    const tiers = [
      'lower("bot"."db_characters"."name") = lower($',
      'unaccent(lower("bot"."db_characters"."name")) ~ $',
      "like unaccent(lower($",
      'length("bot"."db_characters"."name") asc',
      "greatest(similarity(",
      '"bot"."db_characters"."id"',
    ].map((needle) => orderBy.indexOf(needle));
    expect(tiers.every((i) => i >= 0)).toBe(true);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  test("binds the escaped whole-word regex as one parameter", () => {
    const { params } = orderBySql("Sôn.Gokû (x)");
    expect(params).toContain("\\mson\\.goku \\(x\\)\\M");
    expect(params).toContain("Sôn.Gokû (x)");
  });

  test("never interpolates the raw term into the SQL text", () => {
    const hostile = "x'); drop table bot.db_characters; --";
    const { sql, params } = orderBySql(hostile);
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain(hostile);
    expect(params).toContain(hostile);
  });

  test("escapes every regex metacharacter", () => {
    expect(escapeRegex("a\\^$.|?*+()[]{}")).toBe("a\\\\\\^\\$\\.\\|\\?\\*\\+\\(\\)\\[\\]\\{\\}");
    expect(wholeWordPattern("  Gôhan ")).toBe("\\mgohan\\M");
  });

  test("every searched wiki table has an id column for the last tie-break", () => {
    const searched = [
      "botCharacters",
      "botPlanets",
      "botSagas",
      "botMovies",
      "botGames",
      "botEpisodes",
      "botTechniques",
      "botRaces",
      "botTransformations",
      "botArcs",
      "botMangaVolumes",
      "botMangaChapters",
      "botBattles",
      "botLocations",
      "botTournaments",
      "botVoiceActors",
      "botSoundtracks",
      "botPowerLevels",
      "botItems",
      "botDragons",
      "botDatabooks",
      "botMediaPublications",
      "botContributors",
    ] as const;
    for (const name of searched) {
      expect(getTableColumns(botSchema[name]).id, name).toBeDefined();
    }
  });
});

describe("fuzzyOrder options", () => {
  const vols = [botSchema.botMangaVolumes.title, botSchema.botMangaVolumes.series];

  function volumeOrder(options: Parameters<typeof fuzzyOrder>[2]) {
    return db
      .select({ id: botSchema.botMangaVolumes.id })
      .from(botSchema.botMangaVolumes)
      .orderBy(...fuzzyOrder("5", vols, options))
      .toSQL().sql;
  }

  test("explicit tie-breaks run after similarity and before the id", () => {
    const sql = volumeOrder({
      shortestFirst: false,
      then: [asc(botSchema.botMangaVolumes.volumeNumber)],
    });
    const at = (needle: string) => sql.indexOf(needle);
    expect(sql).not.toContain("length(");
    expect(at("greatest(similarity(")).toBeLessThan(at('"volume_number"'));
    expect(at('"volume_number"')).toBeLessThan(sql.lastIndexOf('"id"'));
  });

  test("the length tier is the default and can be disabled", () => {
    expect(volumeOrder(undefined)).toContain("length(");
    expect(volumeOrder({ shortestFirst: false })).not.toContain("length(");
  });
});
