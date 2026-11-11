// SPDX-License-Identifier: Apache-2.0
/**
 * Reverse-Engineering (RE) Telemetry & Binary Artifacts Database.
 * Persists binary triage, sections, symbols, and asset container telemetries
 * in SQLite (via `bun:sqlite`) and syncs across Redis clusters.
 */
import { Database } from "bun:sqlite";
import type { ResilientRedis } from "./redis";

export interface GameReRecord {
  game_slug: string;
  binary_name: string;
  binary_path: string;
  architecture: "x64" | "x86" | "arm64" | "wasm";
  format: string;
  entry_point: string;
  sections: Array<{ name: string; virtual_address: number | string; size: number }>;
  exports_count: number;
  imports_count: number;
  paks?: Array<{ name: string; size: number; version: number; encrypted: boolean }>;
  metadata?: Record<string, unknown>;
  updated_at?: number;
}

export function initReTelemetryDb(path: string = ":memory:"): Database {
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL;");
  db.run(`
    CREATE TABLE IF NOT EXISTS game_re_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_slug TEXT NOT NULL,
      binary_name TEXT NOT NULL,
      binary_path TEXT NOT NULL,
      architecture TEXT NOT NULL,
      format TEXT NOT NULL,
      entry_point TEXT NOT NULL,
      sections_json TEXT NOT NULL,
      exports_count INTEGER NOT NULL,
      imports_count INTEGER NOT NULL,
      paks_json TEXT,
      metadata_json TEXT,
      updated_at INTEGER NOT NULL,
      UNIQUE(game_slug, binary_name)
    );
    CREATE INDEX IF NOT EXISTS idx_game_re_slug ON game_re_telemetry(game_slug);
  `);
  return db;
}

export async function saveReTelemetry(
  db: Database,
  record: GameReRecord,
  redis?: ResilientRedis,
): Promise<void> {
  const now = record.updated_at ?? Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    INSERT INTO game_re_telemetry (
      game_slug, binary_name, binary_path, architecture, format,
      entry_point, sections_json, exports_count, imports_count,
      paks_json, metadata_json, updated_at
    ) VALUES ($slug, $bin, $path, $arch, $format, $ep, $sec, $exp, $imp, $paks, $meta, $now)
    ON CONFLICT(game_slug, binary_name) DO UPDATE SET
      binary_path = excluded.binary_path,
      architecture = excluded.architecture,
      format = excluded.format,
      entry_point = excluded.entry_point,
      sections_json = excluded.sections_json,
      exports_count = excluded.exports_count,
      imports_count = excluded.imports_count,
      paks_json = excluded.paks_json,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    $slug: record.game_slug,
    $bin: record.binary_name,
    $path: record.binary_path,
    $arch: record.architecture,
    $format: record.format,
    $ep: record.entry_point,
    $sec: JSON.stringify(record.sections),
    $exp: record.exports_count,
    $imp: record.imports_count,
    $paks: record.paks ? JSON.stringify(record.paks) : null,
    $meta: record.metadata ? JSON.stringify(record.metadata) : null,
    $now: now,
  });

  // Sync to Redis if available
  if (redis && redis.connected) {
    try {
      const redisKey = `game:re:${record.game_slug}:${record.binary_name}`;
      await redis.send("HSET", [
        redisKey,
        "format",
        record.format,
        "architecture",
        record.architecture,
        "entry_point",
        record.entry_point,
        "sections_count",
        String(record.sections.length),
        "updated_at",
        String(now),
      ]);
      await redis.send("PUBLISH", [
        "channel:re:telemetry",
        JSON.stringify({ game: record.game_slug, binary: record.binary_name, at: now }),
      ]);
    } catch (err) {
      console.warn("[RE-TELEMETRY] Redis synchronization skipped:", err);
    }
  }
}

export function getReTelemetry(
  db: Database,
  gameSlug: string,
  binaryName: string,
): GameReRecord | null {
  const row = db
    .prepare(
      `
    SELECT * FROM game_re_telemetry WHERE game_slug = ? AND binary_name = ?
  `,
    )
    .get(gameSlug, binaryName) as any;

  if (!row) return null;

  return {
    game_slug: row.game_slug,
    binary_name: row.binary_name,
    binary_path: row.binary_path,
    architecture: row.architecture,
    format: row.format,
    entry_point: row.entry_point,
    sections: JSON.parse(row.sections_json),
    exports_count: row.exports_count,
    imports_count: row.imports_count,
    paks: row.paks_json ? JSON.parse(row.paks_json) : undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    updated_at: row.updated_at,
  };
}

export function listReTelemetry(db: Database, gameSlug?: string): GameReRecord[] {
  const query = gameSlug
    ? db
        .prepare("SELECT * FROM game_re_telemetry WHERE game_slug = ? ORDER BY binary_name ASC")
        .all(gameSlug)
    : db.prepare("SELECT * FROM game_re_telemetry ORDER BY game_slug ASC, binary_name ASC").all();

  return (query as any[]).map((row) => ({
    game_slug: row.game_slug,
    binary_name: row.binary_name,
    binary_path: row.binary_path,
    architecture: row.architecture,
    format: row.format,
    entry_point: row.entry_point,
    sections: JSON.parse(row.sections_json),
    exports_count: row.exports_count,
    imports_count: row.imports_count,
    paks: row.paks_json ? JSON.parse(row.paks_json) : undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    updated_at: row.updated_at,
  }));
}
