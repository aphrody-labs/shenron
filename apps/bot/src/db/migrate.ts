import "reflect-metadata";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { container } from "tsyringe";
import { DatabaseService } from "./index";
import { join } from "node:path";
import { ensureWikiReplicaSchema, ensureWikiVisibility } from "./wiki-visibility";

export const MIGRATIONS_FOLDER = join(import.meta.dir, "migrations");

/**
 * Applies the SQL migrations, then the idempotent replica completions, in the
 * same order as the bot boot (`src/index.ts`). Importing this module has no side
 * effect: tests build a migrated in-memory base with it.
 */
export function applyBotMigrations(svc: DatabaseService): void {
  migrate(svc.db, { migrationsFolder: MIGRATIONS_FOLDER });
  ensureWikiReplicaSchema(svc.sqlite);
  ensureWikiVisibility(svc.sqlite);
}

if (import.meta.main) {
  const svc = container.resolve(DatabaseService);
  applyBotMigrations(svc);
  console.log("✓ Migrations applied");
  svc.close();
}
