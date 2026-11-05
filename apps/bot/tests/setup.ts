/**
 * Test setup — isolate DB et env.
 * Importer ce module **en premier**, avant toute classe du bot.
 */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

Bun.env.NODE_ENV = "test";
Bun.env.DISCORD_TOKEN ??= "test-token";
Bun.env.DISCORD_TOKEN_BEERUS ??= "test-token";
Bun.env.DISCORD_TOKEN_WHIS ??= "test-token";
Bun.env.DISCORD_TOKEN_GRAND_PRETRE ??= "test-token";
Bun.env.DISCORD_TOKEN_ENMA ??= "test-token";
Bun.env.DISCORD_TOKEN_KAIO ??= "test-token";
Bun.env.GUILD_ID ??= "1497167233280118896";
Bun.env.OWNER_ID ??= "11111111111111111";
// Rôle de cachot : le re-cachot au rejoin est conditionné à cette variable.
// Sans elle, `JoinLeave.onJoin` ne réapplique rien — et le test correspondant
// échouait pour cette seule raison, en attendant un identifiant de repli que le
// code de production ne connaît pas. (En production, la variable EST définie.)
Bun.env.JAIL_ROLE_ID ??= "1405635615827034194";
// Isolated files share a process; an earlier SQLite handle may still be open on Windows.
// Give every setup its own database instead of unlinking another isolate's live file.
Bun.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "shenron-bot-test-")), "bot.db");
Bun.env.LOG_LEVEL = "error"; // silence pino pendant les tests

const dbPath = Bun.env.DATABASE_PATH;

// Applique les migrations sur la DB fraîche
const { drizzle } = await import("drizzle-orm/bun-sqlite");
const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
const { Database } = await import("bun:sqlite");
const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
const db = drizzle(sqlite);

const migrationsFolder = join(import.meta.dir, "../src/db/migrations");
console.log("Migrations folder:", migrationsFolder);
migrate(db, { migrationsFolder });
const { ensureWikiReplicaSchema } = await import("../src/db/wiki-visibility");
ensureWikiReplicaSchema(sqlite);
for (const statement of [
  "ALTER TABLE users ADD COLUMN equipped_banner TEXT;",
  "ALTER TABLE users ADD COLUMN zeni_frozen INTEGER NOT NULL DEFAULT 0;",
  "ALTER TABLE level_rewards ADD COLUMN banner_url TEXT;",
  // Colonne présente dans le réplica de production (15 colonnes) et dans le schéma
  // Drizzle, absente des migrations SQLite.
  "ALTER TABLE db_episodes ADD COLUMN video_url TEXT;",
]) {
  try {
    sqlite.exec(statement);
  } catch {
    // Existing migration already includes the compatibility column.
  }
}
sqlite.exec(`CREATE TABLE IF NOT EXISTS economy_flags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id TEXT NOT NULL,
		severity TEXT NOT NULL DEFAULT 'medium',
		code TEXT NOT NULL,
		reason TEXT NOT NULL,
		meta TEXT,
		status TEXT NOT NULL DEFAULT 'open',
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
		resolved_at INTEGER,
		resolved_by TEXT,
		resolve_note TEXT
	);`);
sqlite.close();
