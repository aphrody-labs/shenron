// SPDX-License-Identifier: Apache-2.0
/**
 * Drizzle declaration (`src/db/schema.ts`) versus the base the bot really builds.
 *
 * The migrations 0017 to 0023 are hand written and have no drizzle-kit snapshot, so the
 * declaration can drift silently. This test applies every migration through the bot's own
 * migrator on an in-memory base, then compares `pragma_table_info`, `pragma_index_list` and
 * `pragma_foreign_key_list` with the declaration: tables, columns, affinities, NOT NULL,
 * defaults, primary keys, unique keys, named indexes and foreign keys.
 */
import "./setup";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { is, SQL } from "drizzle-orm";
import { getTableConfig, SQLiteTable, type SQLiteColumn } from "drizzle-orm/sqlite-core";

import { DatabaseService } from "../src/db/index";
import { applyBotMigrations } from "../src/db/migrate";
import * as schema from "../src/db/schema";

/** Created by SQLite or by drizzle itself, never declared. */
const SYSTEM_TABLES = new Set(["__drizzle_migrations"]);

/** SQLite flexible typing: the affinity of a declared type, per the SQLite datatype rules. */
function affinity(declared: string): "INTEGER" | "TEXT" | "BLOB" | "REAL" | "NUMERIC" {
  const type = declared.toUpperCase();
  if (type.includes("INT")) return "INTEGER";
  if (/CHAR|CLOB|TEXT/.test(type)) return "TEXT";
  if (type === "" || type.includes("BLOB")) return "BLOB";
  if (/REAL|FLOA|DOUB/.test(type)) return "REAL";
  return "NUMERIC";
}

/** `'x'`, `"x"`, `(1)` and `true` all reduce to the literal they denote; anything else is code. */
function defaultKey(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "none";
  let value = raw.trim();
  while (value.startsWith("(") && value.endsWith(")")) value = value.slice(1, -1).trim();
  if (/^(true)$/i.test(value)) return "literal:1";
  if (/^(false)$/i.test(value)) return "literal:0";
  if (/^null$/i.test(value)) return "literal:null";
  const quoted = value.match(/^'((?:[^']|'')*)'$/s) ?? value.match(/^"([^"]*)"$/s);
  if (quoted) return `literal:${quoted[1]!.replaceAll("''", "'")}`;
  if (/^[+-]?\d+(\.\d+)?$/.test(value)) return `literal:${Number(value)}`;
  return "expression";
}

function drizzleDefaultKey(column: SQLiteColumn): string {
  const value = column.default as unknown;
  if (value === undefined) return "none";
  if (is(value as object, SQL)) return "expression";
  if (typeof value === "boolean") return `literal:${value ? 1 : 0}`;
  if (typeof value === "number") return `literal:${value}`;
  if (typeof value === "string") return `literal:${value}`;
  if (value === null) return "literal:null";
  return `literal:${JSON.stringify(value)}`;
}

interface ColumnModel {
  affinity: string;
  notNull: boolean;
  default: string;
}

interface TableModel {
  columns: Record<string, ColumnModel>;
  primaryKey: string[];
  /** Unique keys whatever their origin (inline UNIQUE, CREATE UNIQUE INDEX), as column lists. */
  unique: string[];
  /** Named indexes made with CREATE INDEX, `name(col, col)`; unique ones are listed here too. */
  indexes: string[];
  foreignKeys: string[];
}

type Db = ReturnType<typeof DatabaseService.forPath>["sqlite"];

function migratedBase() {
  const service = DatabaseService.forPath(":memory:");
  applyBotMigrations(service);
  return service;
}

function virtualTables(sqlite: Db): Set<string> {
  const names = new Set<string>();
  const virtual = sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND sql LIKE 'CREATE VIRTUAL TABLE%'",
    )
    .all();
  for (const { name } of virtual) {
    names.add(name);
    // Shadow tables of FTS5 and friends: <name>_data, _idx, _content, _docsize, _config.
    for (const suffix of ["data", "idx", "content", "docsize", "config"]) {
      names.add(`${name}_${suffix}`);
    }
  }
  return names;
}

function readActual(sqlite: Db): Record<string, TableModel> {
  const skipped = virtualTables(sqlite);
  const tables = sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
    .filter((name) => !SYSTEM_TABLES.has(name) && !skipped.has(name));

  const model: Record<string, TableModel> = {};
  for (const table of tables) {
    const info = sqlite
      .query<
        { name: string; type: string; notnull: number; dflt_value: string | null; pk: number },
        [string]
      >('SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?)')
      .all(table);
    const primaryKey = info
      .filter((column) => column.pk > 0)
      .toSorted((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const columns: Record<string, ColumnModel> = {};
    for (const column of info) {
      columns[column.name] = {
        affinity: affinity(column.type),
        // A primary key column is never NULL in practice: an INTEGER one is the rowid, and the
        // bot never inserts a NULL key into the others (SQLite would merely allow it).
        notNull: column.notnull === 1 || column.pk > 0,
        default: defaultKey(column.dflt_value),
      };
    }

    const unique: string[] = [];
    const indexes: string[] = [];
    const list = sqlite
      .query<{ name: string; unique: number; origin: string }, [string]>(
        'SELECT name, "unique", origin FROM pragma_index_list(?)',
      )
      .all(table);
    for (const index of list) {
      if (index.origin === "pk") continue;
      const cols = sqlite
        .query<{ name: string }, [string]>("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
        .all(index.name)
        .map((column) => column.name);
      if (index.unique) unique.push(cols.join(","));
      if (index.origin === "c") {
        indexes.push(`${index.name}(${cols.join(",")})${index.unique ? " unique" : ""}`);
      }
    }

    const foreignKeys = sqlite
      .query<{ from: string; table: string; to: string; on_delete: string }, [string]>(
        'SELECT "from", "table", "to", on_delete FROM pragma_foreign_key_list(?)',
      )
      .all(table)
      .map((fk) => `${fk.from}->${fk.table}.${fk.to} ${fk.on_delete.toLowerCase()}`);

    model[table] = {
      columns,
      primaryKey,
      unique: unique.toSorted(),
      indexes: indexes.toSorted(),
      foreignKeys: foreignKeys.toSorted(),
    };
  }
  return model;
}

function readDeclared(): Record<string, TableModel> {
  const model: Record<string, TableModel> = {};
  for (const value of Object.values(schema)) {
    if (!is(value as object, SQLiteTable)) continue;
    const config = getTableConfig(value as SQLiteTable);
    const columns: Record<string, ColumnModel> = {};
    for (const column of config.columns) {
      columns[column.name] = {
        affinity: affinity(column.getSQLType()),
        notNull: column.notNull,
        default: drizzleDefaultKey(column),
      };
    }
    const composite = config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name));
    const single = config.columns.filter((column) => column.primary).map((column) => column.name);
    const primaryKey = composite.length > 0 ? composite : single;

    const unique: string[] = [];
    for (const column of config.columns) if (column.isUnique) unique.push(column.name);
    for (const constraint of config.uniqueConstraints) {
      unique.push(constraint.columns.map((column) => column.name).join(","));
    }
    const indexes: string[] = [];
    for (const index of config.indexes) {
      const cols = index.config.columns.map((column) => (column as { name: string }).name);
      if (index.config.unique) unique.push(cols.join(","));
      indexes.push(
        `${index.config.name}(${cols.join(",")})${index.config.unique ? " unique" : ""}`,
      );
    }
    // Column-level `.unique()` is emitted as a named unique index by drizzle-kit.
    for (const column of config.columns) {
      if (column.isUnique) {
        indexes.push(
          `${column.uniqueName ?? `${config.name}_${column.name}_unique`}(${column.name}) unique`,
        );
      }
    }

    const foreignKeys = config.foreignKeys.map((fk) => {
      const reference = fk.reference();
      const from = reference.columns.map((column) => column.name).join(",");
      const to = reference.foreignColumns.map((column) => column.name).join(",");
      const target = getTableConfig(reference.foreignTable as SQLiteTable).name;
      return `${from}->${target}.${to} ${(fk.onDelete ?? "no action").toLowerCase()}`;
    });

    model[config.name] = {
      columns,
      primaryKey,
      unique: unique.toSorted(),
      indexes: indexes.toSorted(),
      foreignKeys: foreignKeys.toSorted(),
    };
  }
  return model;
}

/** Index names whose column-level unique form differs by origin only (inline vs CREATE UNIQUE). */
function withoutInlineUniqueNames(model: TableModel, actual: TableModel): TableModel {
  // Inline `UNIQUE` (origin "u") has an anonymous autoindex: it is checked as a unique key,
  // while a named `<table>_<col>_unique` index is only expected when the base has it.
  const named = new Set(actual.indexes.map((entry) => entry.replace(/\(.*$/, "")));
  return {
    ...model,
    indexes: model.indexes.filter((entry) => {
      const name = entry.replace(/\(.*$/, "");
      return !name.endsWith("_unique") || named.has(name);
    }),
  };
}

function differences(
  actual: Record<string, TableModel>,
  declared: Record<string, TableModel>,
): string[] {
  const out: string[] = [];
  for (const table of Object.keys(actual).toSorted()) {
    if (!declared[table])
      out.push(`${table}: created by the migrations, not declared in schema.ts`);
  }
  for (const table of Object.keys(declared).toSorted()) {
    const real = actual[table];
    if (!real) {
      out.push(`${table}: declared in schema.ts, absent from the migrated base`);
      continue;
    }
    const want = withoutInlineUniqueNames(declared[table]!, real);
    for (const name of Object.keys(real.columns)) {
      if (!want.columns[name]) out.push(`${table}.${name}: column in the base, not declared`);
    }
    for (const [name, column] of Object.entries(want.columns)) {
      const base = real.columns[name];
      if (!base) {
        out.push(`${table}.${name}: declared, absent from the base`);
        continue;
      }
      if (base.affinity !== column.affinity) {
        out.push(
          `${table}.${name}: affinity ${base.affinity} in the base, ${column.affinity} declared`,
        );
      }
      if (base.notNull !== column.notNull) {
        out.push(
          `${table}.${name}: NOT NULL ${base.notNull} in the base, ${column.notNull} declared`,
        );
      }
      if (base.default !== column.default) {
        out.push(
          `${table}.${name}: default ${base.default} in the base, ${column.default} declared`,
        );
      }
    }
    const compare = (label: string, base: string[], decl: string[]) => {
      if (JSON.stringify(base) !== JSON.stringify(decl)) {
        out.push(`${table}: ${label} base=[${base.join(" | ")}] declared=[${decl.join(" | ")}]`);
      }
    };
    compare("primary key", real.primaryKey, want.primaryKey);
    compare("unique keys", real.unique, want.unique);
    compare("indexes", real.indexes, want.indexes);
    compare("foreign keys", real.foreignKeys, want.foreignKeys);
  }
  return out;
}

describe("schema.ts describes the base produced by the migrations", () => {
  const service = migratedBase();
  const actual = readActual(service.sqlite);
  const declared = readDeclared();

  test("every table, column, affinity, NOT NULL, default, key, index and foreign key matches", () => {
    expect(differences(actual, declared)).toEqual([]);
  });

  test("the action_logs audit index exists (monthly leaderboard and audit reads)", () => {
    expect(actual.action_logs!.indexes).toContain("idx_log_action_created(action,created_at)");
    const plan = service.sqlite
      .query<{ detail: string }, []>(
        "EXPLAIN QUERY PLAN SELECT count(*) FROM action_logs WHERE action = 'x' AND created_at >= 0",
      )
      .all()
      .map((row) => row.detail)
      .join(" ");
    expect(plan).toContain("idx_log_action_created");
  });

  test("the CREATE TABLE IF NOT EXISTS the services still run at boot match the migrations", () => {
    // These tables existed before any migration declared them: the services keep creating them,
    // so their DDL must stay structurally identical to migrations 0021 and 0023.
    const sources = [
      ["../src/services/InflationService.ts", ["economy_index"]],
      ["../src/services/UrsafService.ts", ["ursaf_notices"]],
      ["../src/services/AntiCheatService.ts", ["economy_flags"]],
      ["../src/lib/discord-profiles.ts", ["discord_user_profiles"]],
    ] as const;
    for (const [file, tables] of sources) {
      const text = readFileSync(join(import.meta.dir, file), "utf8");
      const statements = text.match(
        /CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS[^;]*;/g,
      );
      expect(statements?.length).toBeGreaterThan(0);
      const bare = new Database(":memory:");
      for (const statement of statements!) bare.exec(statement);
      const fromService = readActual(bare);
      bare.close();
      for (const table of tables) {
        expect({ file, table, model: fromService[table] }).toEqual({
          file,
          table,
          model: actual[table],
        });
      }
    }
  });

  test("applying the migrations twice leaves the structure unchanged", () => {
    applyBotMigrations(service);
    expect(readActual(service.sqlite)).toEqual(actual);
  });

  test("the comparison itself detects drift", () => {
    const tampered = structuredClone(declared);
    tampered.users!.columns.xp!.notNull = false;
    delete tampered.users!.columns.zeni;
    tampered.action_logs!.indexes = tampered.action_logs!.indexes.filter(
      (entry) => !entry.startsWith("idx_log_action_created"),
    );
    const found = differences(actual, tampered).join("\n");
    expect(found).toContain("users.xp: NOT NULL true in the base, false declared");
    expect(found).toContain("users.zeni: column in the base, not declared");
    expect(found).toContain("action_logs: indexes");
  });

  test("affinity and default normalisation", () => {
    expect(affinity("varchar(30)")).toBe("TEXT");
    expect(affinity("BIGINT")).toBe("INTEGER");
    expect(affinity("DOUBLE")).toBe("REAL");
    expect(affinity("numeric")).toBe("NUMERIC");
    expect(affinity("")).toBe("BLOB");
    expect(defaultKey("true")).toBe("literal:1");
    expect(defaultKey("'[]'")).toBe("literal:[]");
    expect(defaultKey("(unixepoch() * 1000)")).toBe("expression");
    expect(defaultKey("0.78")).toBe("literal:0.78");
    expect(defaultKey(null)).toBe("none");
  });
});
