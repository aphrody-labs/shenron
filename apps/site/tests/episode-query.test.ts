// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  episodeIdentityPredicate,
  episodeQueryPredicate,
  episodeLanguageQuery,
  EpisodeLanguageQueryError,
} from "../src/lib/episode-query";

const dialect = new PgDialect();

test("language query accepts only exact version tags and never silently drops an explicit value", () => {
  expect(episodeLanguageQuery(null)).toBeUndefined();
  expect(episodeLanguageQuery(undefined)).toBeUndefined();
  for (const language of ["vf", "vostfr", "vost"] as const) {
    expect(episodeLanguageQuery(language)).toBe(language);
    const query = dialect.sqlToQuery(episodeQueryPredicate("DBS", "Beerus", language)!);
    expect(query.params).toContain(JSON.stringify([{ lang: language }]));
    expect(query.sql).toContain('"db_episodes"."players" @>');
    expect(query.sql).not.toContain("availability");
    expect(query.sql).not.toContain("subtitles");
    expect(query.params).toContain("DBS");
  }
  for (const invalid of ["", "VO", "vo", "VF", "VOST", "ja", " vf ", "unknown"]) {
    expect(() => episodeLanguageQuery(invalid)).toThrow(EpisodeLanguageQueryError);
  }
});

test("episode detail and video transport bind the ID together with public visibility", () => {
  const query = dialect.sqlToQuery(episodeIdentityPredicate(875)!);
  expect(query.params).toEqual([875, true]);
  expect(query.sql).toContain('"db_episodes"."id" = $1');
  expect(query.sql).toContain('"db_episodes"."visible" = $2');
  expect(query.sql).toContain(" and ");
});

test("episode SQL restricts visibility and series and binds all four searchable fields", () => {
  const query = dialect.sqlToQuery(episodeQueryPredicate("DBS", " Beerus ")!);
  expect(query.params).toEqual([true, "DBS", "%Beerus%", "%Beerus%", "%Beerus%", "%Beerus%"]);
  expect(query.sql).toContain('"db_episodes"."visible"');
  expect(query.sql).toContain('"db_episodes"."series"');
  expect(query.sql).toContain('"db_episodes"."title_ja" ilike');
  expect(query.sql).toContain('"db_episodes"."title_romaji" ilike');
  expect(query.sql).toContain(
    'coalesce("bot"."db_episodes"."synopsis_fr", "bot"."db_episodes"."synopsis") ilike',
  );
  expect(query.sql).not.toContain("Beerus");
});

test("romaji-only names remain searchable through the shared episode predicate", () => {
  const query = dialect.sqlToQuery(episodeQueryPredicate(undefined, "Hakaishin Birusu")!);
  expect(query.sql).toContain('"db_episodes"."title_romaji" ilike $4');
  expect(query.params[3]).toBe("%Hakaishin Birusu%");
  expect(query.sql).not.toContain("Hakaishin Birusu");
});

test("wildcards and injection-like text stay a literal bound search; blank stays unfiltered", () => {
  const query = dialect.sqlToQuery(episodeQueryPredicate(undefined, "100%_\\' OR true--")!);
  expect(query.params).toEqual([
    true,
    "%100\\%\\_\\\\' OR true--%",
    "%100\\%\\_\\\\' OR true--%",
    "%100\\%\\_\\\\' OR true--%",
    "%100\\%\\_\\\\' OR true--%",
  ]);
  expect(query.sql).not.toContain("OR true--");
  const blank = dialect.sqlToQuery(episodeQueryPredicate(undefined, "  ")!);
  expect(blank.params).toEqual([true]);
  expect(blank.sql).not.toContain("ilike");
});
