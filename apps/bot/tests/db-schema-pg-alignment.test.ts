// SPDX-License-Identifier: Apache-2.0
/**
 * PostgreSQL replica declaration (`@aphrody/shenron-db/bot-schema`) versus the SQLite base.
 *
 * The runtime sync copies the bot's state tables into PostgreSQL schema `bot`. This test builds
 * the SQLite base through the bot's migrator and checks, for every replicated table, that the
 * PostgreSQL declaration has the same columns, the same primary key and a compatible type, and
 * that every table of the base has an explicit owner so a new table cannot be forgotten.
 */
import "./setup";
import { describe, expect, test } from "bun:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as botSchema from "@aphrody/shenron-db/bot-schema";

import { DatabaseService } from "../src/db/index";
import { applyBotMigrations } from "../src/db/migrate";

const { BOT_STATE_REPLICA_TABLES, BOT_JOURNAL_REPLICA_TABLES } = botSchema;

/** Tables of the SQLite base that the runtime sync deliberately does not mirror, with the reason. */
const NOT_MIRRORED: Record<string, string> = {
  jails: "sync-bot-private-sqlite-to-postgres.ts owns it (negative hashed ids, provenance)",
  dm_contacts: "sync-bot-private-sqlite-to-postgres.ts owns it",
  dm_messages: "sync-bot-private-sqlite-to-postgres.ts owns it",
  discord_user_profiles: "sync-discord-profiles-sqlite-to-postgres.ts owns it",
  invites_log: "append-only log without a stable id mapping yet",
  ba_user: "authentication data never leaves the SQLite",
  ba_session: "authentication data never leaves the SQLite",
  ba_account: "authentication data never leaves the SQLite",
  ba_verification: "authentication data never leaves the SQLite",
  activity_settlements:
    "idempotency ledger of the Activity settlements: bot-local (the credits are mirrored through users and action_logs)",
  admin_goals: "cockpit table, PostgreSQL ownership still undecided (SH-API-5)",
  admin_reports: "cockpit table, PostgreSQL ownership still undecided (SH-API-5)",
  admin_lab_messages: "cockpit table, PostgreSQL ownership still undecided (SH-API-5)",
  rag_training_feedback: "cockpit table, PostgreSQL ownership still undecided (SH-API-5)",
};

const FAMILY: Record<string, string> = {
  INTEGER: "bigint",
  TEXT: "text",
  REAL: "double precision",
};

function affinity(declared: string): string {
  const type = declared.toUpperCase();
  if (type.includes("INT")) return "INTEGER";
  if (/CHAR|CLOB|TEXT/.test(type)) return "TEXT";
  if (type === "" || type.includes("BLOB")) return "BLOB";
  if (/REAL|FLOA|DOUB/.test(type)) return "REAL";
  return "NUMERIC";
}

const service = DatabaseService.forPath(":memory:");
applyBotMigrations(service);
const sqlite = service.sqlite;

const pgTables: PgTable[] = [];
for (const value of Object.values(botSchema)) {
  if (is(value as object, PgTable)) pgTables.push(value as PgTable);
}
const pgByName = new Map(pgTables.map((table) => [getTableConfig(table).name, table]));
const replicated: PgTable[] = [...BOT_STATE_REPLICA_TABLES, ...BOT_JOURNAL_REPLICA_TABLES];

function sqliteColumns(table: string) {
  return sqlite
    .query<{ name: string; type: string; pk: number }, [string]>(
      "SELECT name, type, pk FROM pragma_table_info(?)",
    )
    .all(table);
}

describe("bot-schema.ts declares the bot state tables replicated into PostgreSQL", () => {
  test("every replicated table is a distinct table of schema bot", () => {
    const names = replicated.map((table) => getTableConfig(table).name);
    expect(new Set(names).size).toBe(names.length);
    for (const table of replicated) expect(getTableConfig(table).schema).toBe("bot");
    const states = new Set(BOT_STATE_REPLICA_TABLES.map((table) => getTableConfig(table).name));
    for (const table of BOT_JOURNAL_REPLICA_TABLES) {
      expect(states.has(getTableConfig(table).name)).toBe(false);
    }
  });

  for (const table of replicated) {
    const config = getTableConfig(table);
    test(`${config.name}: columns, primary key and types follow the SQLite table`, () => {
      const actual = sqliteColumns(config.name);
      expect(actual.length).toBeGreaterThan(0);

      const declared = new Map(config.columns.map((column) => [column.name, column]));
      const sqliteNames = actual.map((column) => column.name).toSorted();
      expect([...declared.keys()].toSorted()).toEqual(sqliteNames);

      for (const column of actual) {
        const pgType = declared.get(column.name)!.getSQLType();
        expect({ column: column.name, type: pgType }).toEqual({
          column: column.name,
          type: FAMILY[affinity(column.type)],
        });
      }

      const sqlitePk = actual
        .filter((column) => column.pk > 0)
        .toSorted((a, b) => a.pk - b.pk)
        .map((column) => column.name);
      const composite = config.primaryKeys.flatMap((key) => key.columns.map((c) => c.name));
      const single = config.columns.filter((column) => column.primary).map((column) => column.name);
      expect(composite.length > 0 ? composite : single).toEqual(sqlitePk);
    });
  }

  test("the columns the audit named are replicated (zeni_frozen, equipped_banner, race_*)", () => {
    const users = new Set(getTableConfig(botSchema.botUsers).columns.map((column) => column.name));
    for (const column of [
      "zeni_frozen",
      "equipped_banner",
      "race",
      "race_chosen_at",
      "race_boost_until",
      "last_race_regen_at",
    ]) {
      expect(users.has(column)).toBe(true);
    }
  });

  test("every table of the SQLite base has an explicit owner", () => {
    const mirrored = new Set(replicated.map((table) => getTableConfig(table).name));
    const base = sqlite
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         AND name <> '__drizzle_migrations' AND name NOT LIKE 'db_search%'`,
      )
      .all()
      .map((row) => row.name);
    const unowned = base.filter(
      // Wiki tables are PostgreSQL-sourced: declared in bot-schema.ts, copied down by the reverse sync.
      (name) => !mirrored.has(name) && !(name in NOT_MIRRORED) && !pgByName.has(name),
    );
    expect(unowned).toEqual([]);
    for (const name of Object.keys(NOT_MIRRORED)) {
      expect(base).toContain(name);
      expect(mirrored.has(name)).toBe(false);
    }
  });
});
