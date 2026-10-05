import { describe, expect, mock, test } from "bun:test";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// SH-P0-004 : un dépôt masqué (`db_tools.visible = false`) n'a ni fiche
// publique ni place dans les totaux, comme dans la liste `tools()`.
mock.module("server-only", () => ({}));

type Call = { table: string; where: string | null };
const calls: Call[] = [];
const dialect = new PgDialect();

/**
 * Faux client Drizzle : enregistre table et WHERE, puis résout des lignes
 * neutres une fois la chaîne construite (elle l'est de façon synchrone).
 */
function select() {
  const call: Call = { table: "", where: null };
  const rows = new Promise<unknown[]>((resolve) => {
    queueMicrotask(() => resolve(call.where?.includes("slug") ? [] : [{ n: 3 }]));
  });
  const builder = Object.assign(rows, {
    from(table: Parameters<typeof getTableName>[0]) {
      call.table = getTableName(table);
      calls.push(call);
      return builder;
    },
    where(where: SQL) {
      call.where = dialect.sqlToQuery(where).sql;
      return builder;
    },
    limit: () => builder,
    orderBy: () => builder,
  });
  return builder;
}

mock.module("@/lib/db", () => ({ db: { select } }));

const { dbUniverse } = await import("../src/lib/db-universe");

describe("db-universe : outils masqués", () => {
  test("la fiche filtre visible = true comme la liste", async () => {
    calls.length = 0;
    expect(await dbUniverse.tool("depot-masque")).toBeNull();
    const call = calls.find((c) => c.table === "db_tools");
    expect(call?.where).toContain('"db_tools"."slug" = $1');
    expect(call?.where).toContain('"db_tools"."visible" = $2');
  });

  test("le total des outils ne compte que les dépôts visibles", async () => {
    calls.length = 0;
    const counts = await dbUniverse.counts();
    expect(counts?.tools).toBe(3);
    const tools = calls.find((c) => c.table === "db_tools");
    expect(tools?.where).toContain('"db_tools"."visible"');
    // Les actualités n'ont pas de visibilité : compte brut.
    expect(calls.find((c) => c.table === "db_news")?.where).toBeNull();
  });
});
