// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mergeAdminTableCatalog } from "../src/lib/admin-table-catalog";

test("editorial character and technique tables remain available without a bot response", () => {
  const tables = mergeAdminTableCatalog();
  expect(tables.find((table) => table.name === "db_characters")?.readonly).toBe(false);
  expect(tables.find((table) => table.name === "db_techniques")?.mutableColumns).toContain("image");
  expect(tables.find((table) => table.name === "db_character_variants")).toBeDefined();
});

test("the current editorial schema overrides stale bot definitions without hiding other bot tables", () => {
  const tables = mergeAdminTableCatalog([
    {
      name: "db_techniques",
      pk: "id",
      readonly: true,
      mutableColumns: [],
      description: "stale bot copy",
    },
    { name: "custom_bot_table", pk: "id", readonly: true, mutableColumns: [], description: null },
  ]);
  expect(tables.filter((table) => table.name === "db_techniques")).toHaveLength(1);
  expect(tables.find((table) => table.name === "db_techniques")?.readonly).toBe(false);
  expect(tables.some((table) => table.name === "custom_bot_table")).toBe(true);
});
