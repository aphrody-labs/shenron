// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  MASS_DELETE_FLOOR,
  buildDelete,
  buildInsert,
  buildUpdate,
  canonicalValue,
  diffRows,
  massDeleteReason,
  planColumns,
  placeholder,
  quoteIdent,
  rowsPerStatement,
  splitBatches,
  stableStringify,
  toPgParam,
  type PgColumn,
  type SqliteColumn,
  type TablePlan,
} from "./sync-bot-runtime-state";

const pg = (name: string, type: string, extra: Partial<PgColumn> = {}): PgColumn => ({
  name,
  type,
  generated: false,
  identityAlways: false,
  ...extra,
});

const usersSqlite: SqliteColumn[] = [
  { name: "id", pk: 1 },
  { name: "xp", pk: 0 },
  { name: "zeni_frozen", pk: 0 },
  { name: "equipped_banner", pk: 0 },
];

function usersPlan(): TablePlan {
  const planned = planColumns("users", usersSqlite, [
    pg("id", "text"),
    pg("xp", "int8"),
    pg("zeni_frozen", "int8"),
    pg("equipped_banner", "text"),
    pg("legacy_note", "text"),
  ]);
  if (!planned.ok) throw new Error(planned.reason);
  return planned.plan;
}

describe("planColumns", () => {
  test("copies the intersection, primary key first, and reports both leftovers", () => {
    const plan = usersPlan();
    expect(plan.primaryKey).toEqual(["id"]);
    expect(plan.columns.map((column) => column.name)).toEqual([
      "id",
      "equipped_banner",
      "xp",
      "zeni_frozen",
    ]);
    expect(plan.pgOnly).toEqual(["legacy_note"]);
    expect(plan.sqliteOnly).toEqual([]);
  });

  test("a column SQLite has and PostgreSQL lacks is reported, not invented", () => {
    const planned = planColumns("users", usersSqlite, [pg("id", "text"), pg("xp", "int8")]);
    expect(planned.ok && planned.plan.sqliteOnly).toEqual(["equipped_banner", "zeni_frozen"]);
  });

  test("generated and unsupported-type columns are left out, identity columns noted", () => {
    const planned = planColumns(
      "t",
      [
        { name: "id", pk: 1 },
        { name: "a", pk: 0 },
        { name: "b", pk: 0 },
        { name: "c", pk: 0 },
      ],
      [
        pg("id", "int8", { identityAlways: true }),
        pg("a", "int8", { generated: true }),
        pg("b", "bytea"),
        pg("c", "text"),
      ],
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.columns.map((column) => column.name)).toEqual(["id", "c"]);
    expect(planned.plan.unsupported).toEqual(["b:bytea"]);
    expect(planned.plan.identityAlways).toBe(true);
  });

  test("refuses a table with no primary key or a primary key PostgreSQL lacks", () => {
    expect(planColumns("t", [{ name: "a", pk: 0 }], [pg("a", "text")])).toEqual({
      ok: false,
      reason: "SQLite table has no primary key",
    });
    const missing = planColumns("t", [{ name: "id", pk: 1 }], [pg("other", "text")]);
    expect(missing.ok).toBe(false);
    const unsupported = planColumns("t", [{ name: "id", pk: 1 }], [pg("id", "uuid")]);
    expect(unsupported).toEqual({
      ok: false,
      reason: "primary key column id has an unsupported PostgreSQL type",
    });
  });
});

describe("value conversion", () => {
  test("integers compare equal across drivers", () => {
    expect(canonicalValue("123", "int8", "target")).toBe(canonicalValue(123, "int8", "source"));
    expect(canonicalValue("9007199254740993", "int8", "target")).toBe("9007199254740993");
    expect(canonicalValue(true, "int8", "source")).toBe("1");
  });

  test("booleans, floats and numerics", () => {
    expect(canonicalValue(1, "bool", "source")).toBe(canonicalValue(true, "bool", "target"));
    expect(canonicalValue(0, "bool", "source")).toBe("0");
    expect(canonicalValue(0.78, "float8", "source")).toBe(
      canonicalValue("0.78", "numeric", "target"),
    );
    expect(canonicalValue("1.50", "numeric", "target")).toBe("1.5");
  });

  test("JSON text equals the parsed document whatever the key order", () => {
    expect(canonicalValue('{"b":1,"a":[2]}', "jsonb", "source")).toBe(
      canonicalValue({ a: [2], b: 1 }, "jsonb", "target"),
    );
    // A string read from PostgreSQL is a JSON string scalar (a double-encoded document).
    expect(canonicalValue('{"a":1}', "jsonb", "target")).not.toBe(
      canonicalValue('{"a":1}', "jsonb", "source"),
    );
    expect(stableStringify({ z: undefined, a: null })).toBe('{"a":null}');
  });

  test("timestamps compare as epoch milliseconds, seconds are promoted", () => {
    const ms = 1_790_000_000_000;
    expect(canonicalValue(new Date(ms), "timestamptz", "target")).toBe(
      canonicalValue(ms, "timestamptz", "source"),
    );
    expect(canonicalValue(ms / 1000, "timestamptz", "source")).toBe(String(ms));
  });

  test("null stays null whatever the type", () => {
    for (const type of ["int8", "text", "jsonb", "bool", "timestamptz"]) {
      expect(canonicalValue(null, type, "source")).toBeNull();
      expect(toPgParam(undefined, type)).toBeNull();
    }
  });

  test("bind parameters follow the PostgreSQL type", () => {
    expect(toPgParam(1, "bool")).toBe(true);
    expect(toPgParam(0, "bool")).toBe(false);
    expect(toPgParam(true, "int8")).toBe(1);
    expect(toPgParam(12n, "int8")).toBe("12");
    expect(toPgParam(42, "text")).toBe("42");
    expect(toPgParam(0.5, "numeric")).toBe("0.5");
    expect(toPgParam('{"a":1}', "jsonb")).toBe('{"a":1}');
    expect(toPgParam(1_790_000_000_000, "timestamptz")).toBe("2026-09-21T14:13:20.000Z");
    expect(toPgParam(1_790_000_000_000, "date")).toBe("2026-09-21");
  });

  test("an inconvertible value names the problem", () => {
    expect(() => toPgParam(1.5, "int8")).toThrow("not an integer");
    expect(() => toPgParam("x", "bool")).toThrow("not a boolean");
    expect(() => toPgParam("{oops", "jsonb")).toThrow("invalid JSON");
    expect(() => toPgParam(new Uint8Array(2), "text")).toThrow("blob");
    expect(() => toPgParam("nope", "float8")).toThrow("not a number");
  });
});

describe("diffRows", () => {
  const plan = usersPlan();
  const source = [
    { id: "1", xp: 10, zeni_frozen: 0, equipped_banner: null },
    { id: "2", xp: 20, zeni_frozen: 1, equipped_banner: "b" },
    { id: "3", xp: 30, zeni_frozen: 0, equipped_banner: null },
  ];

  test("classifies insert, update, delete and unchanged, comparing across drivers", () => {
    const target = [
      { id: "1", xp: "10", zeni_frozen: "0", equipped_banner: null },
      { id: "2", xp: "21", zeni_frozen: "1", equipped_banner: "b" },
      { id: "9", xp: "99", zeni_frozen: "0", equipped_banner: null },
    ];
    const diff = diffRows(plan, source, target);
    expect(diff.unchanged).toBe(1);
    expect(diff.update.map((row) => row.id)).toEqual(["2"]);
    expect(diff.insert.map((row) => row.id)).toEqual(["3"]);
    expect(diff.absent).toEqual([["9"]]);
    expect(diff.changedColumns).toEqual({ xp: 1 });
    expect(diff.samples.delete).toEqual(['["9"]']);
  });

  test("is idempotent: a mirrored target yields an empty diff", () => {
    const target = source.map((row) => ({ ...row, xp: String(row.xp) }));
    const diff = diffRows(plan, source, target);
    expect([diff.insert.length, diff.update.length, diff.absent.length, diff.unchanged]).toEqual([
      0, 0, 0, 3,
    ]);
  });

  test("a key held twice in PostgreSQL is rewritten as one row", () => {
    const row = { id: "1", xp: "10", zeni_frozen: "0", equipped_banner: null };
    const diff = diffRows(plan, [source[0]!], [row, { ...row }]);
    expect(diff.duplicated).toEqual([["1"]]);
    expect(diff.insert.map((entry) => entry.id)).toEqual(["1"]);
    expect(diff.update).toEqual([]);
  });

  test("composite keys match on every part", () => {
    const planned = planColumns(
      "race_level_roles",
      [
        { name: "race", pk: 1 },
        { name: "level", pk: 2 },
        { name: "role_id", pk: 0 },
      ],
      [pg("race", "text"), pg("level", "int8"), pg("role_id", "text")],
    );
    if (!planned.ok) throw new Error(planned.reason);
    const diff = diffRows(
      planned.plan,
      [
        { race: "saiyan", level: 1, role_id: "a" },
        { race: "saiyan", level: 2, role_id: "b" },
      ],
      [
        { race: "saiyan", level: "1", role_id: "a" },
        { race: "namek", level: "1", role_id: "c" },
      ],
    );
    expect(diff.insert.map((row) => row.level)).toEqual([2]);
    expect(diff.absent).toEqual([["namek", "1"]]);
    expect(diff.unchanged).toBe(1);
  });

  test("a NULL or duplicated SQLite key is an error, not a silent skip", () => {
    expect(() => diffRows(plan, [{ id: null, xp: 1 }], [])).toThrow("NULL in primary key");
    expect(() => diffRows(plan, [{ id: "1" }, { id: "1" }], [])).toThrow("duplicate primary key");
  });

  test("samples are capped", () => {
    const many = Array.from({ length: 12 }, (_, id) => ({ id: String(id), xp: 1 }));
    expect(diffRows(plan, many, []).samples.insert).toHaveLength(5);
  });
});

describe("SQL generation", () => {
  const plan = usersPlan();

  test("insert casts every parameter to the PostgreSQL type", () => {
    const { text, params } = buildInsert("bot", plan, [
      { id: "1", xp: 10, zeni_frozen: 1, equipped_banner: null },
      { id: "2", xp: 20, zeni_frozen: 0, equipped_banner: "b" },
    ]);
    expect(text).toBe(
      'INSERT INTO "bot"."users" ("id", "equipped_banner", "xp", "zeni_frozen") VALUES ($1::text, $2::text, $3::int8, $4::int8), ($5::text, $6::text, $7::int8, $8::int8)',
    );
    expect(params).toEqual(["1", null, 10, 1, "2", "b", 20, 0]);
  });

  test("insert overrides GENERATED ALWAYS identity columns, JSON goes through text", () => {
    const planned = planColumns(
      "t",
      [
        { name: "id", pk: 1 },
        { name: "doc", pk: 0 },
      ],
      [pg("id", "int8", { identityAlways: true }), pg("doc", "jsonb")],
    );
    if (!planned.ok) throw new Error(planned.reason);
    const { text } = buildInsert("bot", planned.plan, [{ id: 1, doc: "{}" }]);
    expect(text).toContain("OVERRIDING SYSTEM VALUE VALUES ($1::int8, ($2::text)::jsonb)");
  });

  test("a bad value names the table, the column and the key", () => {
    expect(() =>
      buildInsert("bot", plan, [{ id: "7", xp: 1.5, zeni_frozen: 0, equipped_banner: null }]),
    ).toThrow('users.xp (key ["7"]): 1.5 is not an integer for int8');
  });

  test("update sets every non-key column and filters on the key", () => {
    const { text, params } = buildUpdate("bot", plan, {
      id: "1",
      xp: 11,
      zeni_frozen: 1,
      equipped_banner: "b",
    });
    expect(text).toBe(
      'UPDATE "bot"."users" SET "equipped_banner" = $1::text, "xp" = $2::int8, "zeni_frozen" = $3::int8 WHERE "id" = $4::text',
    );
    expect(params).toEqual(["b", 11, 1, "1"]);
  });

  test("delete handles single and composite keys", () => {
    expect(buildDelete("bot", plan, [["1"], ["2"]])).toEqual({
      text: 'DELETE FROM "bot"."users" WHERE "id" IN ($1::text, $2::text)',
      params: ["1", "2"],
    });
    const planned = planColumns(
      "race_level_roles",
      [
        { name: "race", pk: 1 },
        { name: "level", pk: 2 },
      ],
      [pg("race", "text"), pg("level", "int8")],
    );
    if (!planned.ok) throw new Error(planned.reason);
    expect(buildDelete("bot", planned.plan, [["saiyan", "1"]])).toEqual({
      text: 'DELETE FROM "bot"."race_level_roles" WHERE ("race", "level") IN (($1::text, $2::int8))',
      params: ["saiyan", "1"],
    });
  });

  test("identifiers are validated, placeholders typed", () => {
    expect(quoteIdent("users")).toBe('"users"');
    expect(() => quoteIdent('users"; DROP TABLE x')).toThrow("Unsafe SQL identifier");
    expect(() => quoteIdent("two words")).toThrow("Unsafe SQL identifier");
    expect(placeholder(3, "varchar")).toBe("$3::text");
    expect(placeholder(1, "timestamptz")).toBe("$1::timestamptz");
  });
});

describe("batches and the deletion guard", () => {
  test("splitBatches bounds every batch", () => {
    expect(splitBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitBatches([], 3)).toEqual([]);
    expect(() => splitBatches([1], 0)).toThrow("Batch size");
  });

  test("a statement never exceeds the bind parameter limit", () => {
    expect(rowsPerStatement(500, 10)).toBe(500);
    expect(rowsPerStatement(5000, 40)).toBe(1500);
    expect(rowsPerStatement(10, 100_000)).toBe(1);
  });

  test("deleting nothing is always allowed", () => {
    expect(massDeleteReason("users", 0, 0, 0)).toBeNull();
    expect(massDeleteReason("users", 10, 10_000, 0)).toBeNull();
  });

  test("an empty source never wipes a populated target", () => {
    expect(massDeleteReason("users", 0, 5, 5)).toContain("SQLite table is empty");
  });

  test("a deletion above the share and the floor needs an explicit flag", () => {
    expect(massDeleteReason("users", 6000, 8000, 2001)).toContain("2001 of 8000");
    expect(massDeleteReason("users", 7000, 8000, 300)).toBeNull();
    expect(massDeleteReason("tiny", 1, 40, MASS_DELETE_FLOOR)).toBeNull();
    expect(massDeleteReason("tiny", 1, 40, MASS_DELETE_FLOOR + 1)).toContain("would be deleted");
  });
});
