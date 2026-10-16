#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Database initialization & migration runner for Shenron container stack.
 *
 * Prepares PostgreSQL (schema, extensions, Drizzle migrations) and SQLite (bot.db).
 *
 * Usage:
 *   bun scripts/ops/container-db-init.ts [--dry-run] [--postgres-only] [--sqlite-only]
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";

const ROOT = resolve(import.meta.dir, "../..");
const SITE_MIGRATIONS_DIR = existsSync("/app/site-migrations")
  ? "/app/site-migrations"
  : join(ROOT, "apps", "site", "src", "db", "migrations");
const BOT_MIGRATIONS_DIR = existsSync("/app/src/db/migrations")
  ? "/app/src/db/migrations"
  : join(ROOT, "apps", "bot", "src", "db", "migrations");

export interface DbInitReport {
  postgres: {
    status: "ok" | "skipped" | "error";
    extensions: string[];
    appliedMigrations: string[];
    error?: string;
  };
  sqlite: {
    status: "ok" | "skipped" | "error";
    path: string;
    appliedMigrations: string[];
    error?: string;
  };
}

export async function runPostgresMigrations(
  databaseUrl: string,
  dryRun = false,
): Promise<{ extensions: string[]; appliedMigrations: string[]; error?: string }> {
  const appliedMigrations: string[] = [];
  const extensions = ["uuid-ossp", "pg_trgm", "unaccent"];

  let sql: ReturnType<typeof postgres> | null = null;
  try {
    sql = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 10,
    });

    // 1. Extensions
    if (!dryRun) {
      for (const ext of extensions) {
        await sql`CREATE EXTENSION IF NOT EXISTS ${sql(ext)};`;
      }

      // Tracking table for migrations
      await sql`
        CREATE TABLE IF NOT EXISTS _container_migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
    }

    // 2. Read migration files
    if (existsSync(SITE_MIGRATIONS_DIR)) {
      const entries = await readdir(SITE_MIGRATIONS_DIR);
      // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
      const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

      for (const file of sqlFiles) {
        if (!dryRun) {
          const already = await sql`
            SELECT 1 FROM _container_migrations WHERE name = ${file} LIMIT 1;
          `;
          if (already.length === 0) {
            const filePath = join(SITE_MIGRATIONS_DIR, file);
            const content = await readFile(filePath, "utf8");

            // Execute migration statements
            await sql.unsafe(content);
            await sql`
              INSERT INTO _container_migrations (name) VALUES (${file});
            `;
            appliedMigrations.push(file);
          }
        } else {
          appliedMigrations.push(`[dry-run] ${file}`);
        }
      }
    }

    return { extensions, appliedMigrations };
  } catch (err) {
    return {
      extensions,
      appliedMigrations,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (sql) await sql.end().catch(() => {});
  }
}

export async function runSqliteMigrations(
  dbPath: string,
  dryRun = false,
): Promise<{ appliedMigrations: string[]; error?: string }> {
  const appliedMigrations: string[] = [];
  try {
    const { Database } = await import("bun:sqlite");
    const db = new Database(dbPath, { create: true });

    if (!dryRun) {
      db.run(`
        CREATE TABLE IF NOT EXISTS _container_sqlite_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }

    if (existsSync(BOT_MIGRATIONS_DIR)) {
      const entries = await readdir(BOT_MIGRATIONS_DIR);
      // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
      const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

      for (const file of sqlFiles) {
        if (!dryRun) {
          const stmt = db.query(
            "SELECT 1 FROM _container_sqlite_migrations WHERE name = ? LIMIT 1;",
          );
          const already = stmt.get(file);
          if (!already) {
            const filePath = join(BOT_MIGRATIONS_DIR, file);
            const content = await readFile(filePath, "utf8");
            db.run(content);
            db.query("INSERT INTO _container_sqlite_migrations (name) VALUES (?);").run(file);
            appliedMigrations.push(file);
          }
        } else {
          appliedMigrations.push(`[dry-run] ${file}`);
        }
      }
    }

    db.close();
    return { appliedMigrations };
  } catch (err) {
    return {
      appliedMigrations,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function initContainerDatabases(
  options: {
    dryRun?: boolean;
    postgresOnly?: boolean;
    sqliteOnly?: boolean;
  } = {},
): Promise<DbInitReport> {
  const dryRun = options.dryRun ?? false;
  if (!dryRun) {
    throw new Error(
      "Direct container migrations are disabled. Use the documented Aphrody Infra migration procedure; db:push is prohibited.",
    );
  }
  const dbUrl =
    process.env.DATABASE_URL ??
    "postgres://shenron:shenron_secure_local_dev@127.0.0.1:5432/shenron_site";
  const sqlitePath = process.env.DATABASE_PATH ?? join(ROOT, "apps", "bot", "data", "bot.db");

  const report: DbInitReport = {
    postgres: { status: "skipped", extensions: [], appliedMigrations: [] },
    sqlite: { status: "skipped", path: sqlitePath, appliedMigrations: [] },
  };

  if (!options.sqliteOnly) {
    const pgRes = await runPostgresMigrations(dbUrl, dryRun);
    report.postgres = {
      status: pgRes.error ? "error" : "ok",
      extensions: pgRes.extensions,
      appliedMigrations: pgRes.appliedMigrations,
      error: pgRes.error,
    };
  }

  if (!options.postgresOnly) {
    const sqRes = await runSqliteMigrations(sqlitePath, dryRun);
    report.sqlite = {
      status: sqRes.error ? "error" : "ok",
      path: sqlitePath,
      appliedMigrations: sqRes.appliedMigrations,
      error: sqRes.error,
    };
  }

  return report;
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  const postgresOnly = process.argv.includes("--postgres-only");
  const sqliteOnly = process.argv.includes("--sqlite-only");

  console.log("--> Initialisation des bases de données du conteneur Shenron...");
  const report = await initContainerDatabases({ dryRun, postgresOnly, sqliteOnly });
  console.log(JSON.stringify(report, null, 2));
}
