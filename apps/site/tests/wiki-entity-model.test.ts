// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  publicEntityUrl,
  sectionEntityType,
  tableForSectionEntity,
} from "../src/lib/wiki-entity-model";

describe("wiki editorial identity", () => {
  test("each admin section type resolves back to its owner table", () => {
    const tables = [
      "db_characters",
      "db_planets",
      "db_sagas",
      "db_arcs",
      "db_races",
      "db_techniques",
      "db_games",
      "db_movies",
    ];
    const types = tables.map(sectionEntityType);
    expect(types.every((type) => type !== null)).toBe(true);
    expect(new Set(types).size).toBe(tables.length);
    const owners: Array<string | null> = types.map((type) => tableForSectionEntity(type!));
    expect(owners).toEqual(tables);
  });

  test("unrelated tables and inherited object properties cannot become editorial parents", () => {
    for (const input of [
      "",
      "db_assets",
      "db_wiki_sections",
      "__proto__",
      "constructor",
      "toString",
      "Character",
    ])
      expect(sectionEntityType(input)).toBeNull();
    for (const input of ["", "db_characters", "__proto__", "constructor", "toString", "Character"])
      expect(tableForSectionEntity(input)).toBeNull();
  });

  test("public links retain domain identities rather than guessing slugs or native media IDs", () => {
    expect(publicEntityUrl("db_characters", { id: 1, slug: "son-goku" })).toBe(
      "/wiki/characters/1",
    );
    expect(publicEntityUrl("db_sagas", { id: 31, slug: "freezer" })).toBe("/wiki/sagas/freezer");
    expect(publicEntityUrl("db_sagas", { id: 31 })).toBeNull();
    expect(publicEntityUrl("media_volumes", { id: 1 })).toBeNull();
    expect(publicEntityUrl("db_databooks", {})).toBe("/wiki/databooks");
    expect(publicEntityUrl("db_assets", { id: 1 })).toBeNull();
  });
});
