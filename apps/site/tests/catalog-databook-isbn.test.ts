// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { botDatabooks } from "../../../packages/db/src/bot-schema";
import { WIKI_TABLE_SPECS } from "../src/lib/wiki-tables";

describe("databook bibliographic ISBN", () => {
  test("maps the existing nullable PostgreSQL ISBN without replacing page metadata", () => {
    const columns = getTableColumns(botDatabooks);
    expect(columns.isbn.name).toBe("isbn");
    expect(columns.isbn.notNull).toBe(false);
    expect(columns.isbn.getSQLType()).toBe("text");
    expect(columns.pages.name).toBe("pages");
  });

  test("permits ISBN edits through the canonical editorial allowlist", () => {
    expect(WIKI_TABLE_SPECS.db_databooks.mutableColumns).toContain("isbn");
    expect(WIKI_TABLE_SPECS.db_databooks.mutableColumns).toContain("sourceUrl");
    expect(WIKI_TABLE_SPECS.db_databooks.mutableColumns).toContain("pages");
  });
});
