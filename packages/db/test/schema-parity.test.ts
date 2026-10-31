// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";

import { compare, expectedTables } from "../scripts/schema-parity";

type Live = Map<string, Map<string, { type: string; notNull: boolean }>>;

/** A database that matches the schemas exactly, built from the schemas themselves. */
function matching(): Live {
  const live: Live = new Map();
  for (const [table, columns] of expectedTables())
    live.set(table, new Map([...columns].map(([name, column]) => [name, { ...column }])));
  return live;
}

describe("schema parity", () => {
  test("a database built from the schemas reports no drift", () => {
    const report = compare(expectedTables(), matching());
    expect(report).toEqual({
      missingTables: [],
      missingColumns: [],
      typeDrift: [],
      nullable: [],
      extraColumns: [],
    });
  });

  test("reports a missing table, a missing column, a type drift and a nullable NOT NULL column", () => {
    const live = matching();
    live.delete("public.CardCatalogCard");
    live.get("public.url_redirects")!.delete("visible");
    live.get("bot.db_battles")!.set("combatants", { type: "text", notNull: false });
    const report = compare(expectedTables(), live);
    expect(report.missingTables).toContain("public.CardCatalogCard");
    expect(report.missingColumns).toContain("public.url_redirects.visible");
    expect(report.typeDrift.some((line) => line.startsWith("bot.db_battles.combatants:"))).toBe(
      true,
    );
    expect(report.nullable).toContain("bot.db_battles.combatants");
  });

  test("serial pseudo-types, timestamp precision and enums are not drifts", () => {
    const live = matching();
    const columns = live.get("public.AgentAudit")!;
    columns.set("id", { type: "bigint", notNull: true });
    expect(compare(expectedTables(), live).typeDrift).toEqual([]);
  });
});
