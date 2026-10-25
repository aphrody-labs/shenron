// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  normalizeWikiListQuery,
  parseWikiCollectionQuery,
  planWikiList,
  planWikiRelation,
  wikiCollectionSearch,
  wikiPageWindow,
  type WikiCollectionQuery,
} from "../src/lib/wiki-collection-query";

describe("wiki collection query rules", () => {
  test("pagination always reaches SQL as bounded finite integers", () => {
    for (const value of [
      undefined,
      null,
      "",
      "NaN",
      "Infinity",
      Infinity,
      NaN,
      -3.8,
      2.5,
      Number.MAX_VALUE,
    ]) {
      const query = normalizeWikiListQuery({ limit: value, offset: value });
      expect(Number.isSafeInteger(query.limit)).toBe(true);
      expect(Number.isSafeInteger(query.offset)).toBe(true);
      expect(query.limit).toBeGreaterThanOrEqual(1);
      expect(query.limit).toBeLessThanOrEqual(500);
      expect(query.offset).toBeGreaterThanOrEqual(0);
    }
  });
  test("search and full primary key ordering form a stable composite row identity", () => {
    const plan = planWikiList(
      ["characterId", "techniqueId", "name"],
      ["characterId", "techniqueId"],
      { q: " 100%_\\ " },
    );
    expect(plan.q).toBe("100%_\\");
    expect(plan.searchColumns).toEqual(["name"]);
    expect(plan.orderColumns).toEqual(["name", "characterId", "techniqueId"]);
    expect(
      planWikiList(["characterId", "techniqueId"], ["characterId", "techniqueId"]).orderColumns,
    ).toEqual(["characterId", "techniqueId"]);
    expect(() => planWikiList(["id"], ["unknown"])).toThrow();
  });
  test("admin request encoding and API parsing preserve existing modes and arbitrary identities", () => {
    const queries: WikiCollectionQuery[] = [
      normalizeWikiListQuery({ q: "悟空 & 100%", limit: 25, offset: 50 }),
      { kind: "byParent", col: "characterId", id: "a&b=2" },
      { kind: "relations", col: "characterId", id: "5", target: "techniqueId" },
      { kind: "options" },
      { kind: "visibility", q: "Goku" },
      { kind: "sectionsFor", entityType: "character", entityId: 5 },
    ];
    for (const query of queries)
      expect(parseWikiCollectionQuery(new URLSearchParams(wikiCollectionSearch(query)))).toEqual(
        query,
      );
    expect(wikiCollectionSearch(queries[1]!)).toContain("as=byParent");
  });
  test("malformed collection intent never falls back to an unrelated full table list", () => {
    for (const query of [
      "as=byparent",
      "as=relations&col=characterId&id=5",
      "as=byParent&col=characterId",
      "as=sectionsFor&entityType=character",
      "as=sectionsFor&entityType=character&entityId=Infinity",
      "as=sectionsFor&entityType=character&entityId=0",
    ])
      expect(() => parseWikiCollectionQuery(new URLSearchParams(query))).toThrow();
    expect(() => planWikiRelation(["id"], "id;drop table", "5")).toThrow();
    expect(() => planWikiRelation(["id"], "id", "5", "unknown")).toThrow();
  });
  test("empty results and a deleted last-page row produce valid recoverable navigation", () => {
    expect(wikiPageWindow(0, { limit: 25, offset: 50 })).toMatchObject({
      offset: 0,
      page: 0,
      pages: 1,
      start: 0,
      end: 0,
      hasPrevious: false,
      hasNext: false,
    });
    expect(wikiPageWindow(50, { limit: 25, offset: 50 })).toMatchObject({
      offset: 25,
      page: 1,
      start: 26,
      end: 50,
      hasPrevious: true,
      hasNext: false,
    });
    expect(wikiPageWindow(51, { limit: 25, offset: 50 })).toMatchObject({
      offset: 50,
      start: 51,
      end: 51,
    });
  });
});
