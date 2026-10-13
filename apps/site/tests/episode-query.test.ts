// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { episodeIdentityPredicate, episodeQueryPredicate } from "../src/lib/episode-query";

const dialect = new PgDialect();

test("episode detail and video transport bind the ID together with public visibility", () => {
  const query = dialect.sqlToQuery(episodeIdentityPredicate(875)!);
  expect(query.params).toEqual([875, true]);
  expect(query.sql).toContain('"db_episodes"."id" = $1');
  expect(query.sql).toContain('"db_episodes"."visible" = $2');
  expect(query.sql).toContain(" and ");
});

test("episode SQL restricts visibility and series and binds all three searchable fields", () => {
  const query = dialect.sqlToQuery(episodeQueryPredicate("DBS", " Beerus ")!);
  expect(query.params).toEqual([true, "DBS", "%Beerus%", "%Beerus%", "%Beerus%"]);
  expect(query.sql).toContain('"db_episodes"."visible"');
  expect(query.sql).toContain('"db_episodes"."series"');
  expect(query.sql).toContain('"db_episodes"."title_ja" ilike');
  expect(query.sql).toContain(
    'coalesce("bot"."db_episodes"."synopsis_fr", "bot"."db_episodes"."synopsis") ilike',
  );
  expect(query.sql).not.toContain("Beerus");
});

test("wildcards and injection-like text stay a literal bound search; blank stays unfiltered", () => {
  const query = dialect.sqlToQuery(episodeQueryPredicate(undefined, "100%_\\' OR true--")!);
  expect(query.params).toEqual([
    true,
    "%100\\%\\_\\\\' OR true--%",
    "%100\\%\\_\\\\' OR true--%",
    "%100\\%\\_\\\\' OR true--%",
  ]);
  expect(query.sql).not.toContain("OR true--");
  const blank = dialect.sqlToQuery(episodeQueryPredicate(undefined, "  ")!);
  expect(blank.params).toEqual([true]);
  expect(blank.sql).not.toContain("ilike");
});
