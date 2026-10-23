// SPDX-License-Identifier: Apache-2.0
/**
 * Where the append-only journals stand: for each (source, table), the highest SQLite identifier whose
 * row, and every row before it, is known to be in PostgreSQL.
 *
 * The cursor is a bookmark, not the proof: a copy always checks the rows it is about to write against
 * the stable PostgreSQL identifiers (`stablePostgresId`), so a lost or stale cursor costs time, never
 * duplicates. It lives in PostgreSQL, next to what it describes, in `bot.sqlite_sync_cursor`
 * (additive DDL below, `apps/site/src/db/bot-sqlite-sync-cursor.sql`).
 */
import { qualified, quoteIdent } from "./statements";
import type { SqlRunner } from "./types";

export const CURSOR_TABLE = "sqlite_sync_cursor";

export interface CursorStore {
  /** The cursor of `table` under `sourceId`; 0 when the table was never copied. */
  get(sourceId: string, table: string): Promise<number>;
  /** Moves the cursor forward (never backward) after `added` rows were written up to `lastId`. */
  advance(sourceId: string, table: string, lastId: number, added: number): Promise<void>;
}

/** The additive, idempotent DDL of the cursor table. */
export function cursorDdl(schema = "bot"): string {
  const table = qualified(schema, CURSOR_TABLE);
  return `CREATE TABLE IF NOT EXISTS ${table} (
  source_id text NOT NULL,
  table_name text NOT NULL,
  last_id bigint NOT NULL,
  rows_synced bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, table_name)
)`;
}

export class PgCursorStore implements CursorStore {
  private readonly table: string;

  constructor(
    private readonly sql: SqlRunner,
    private readonly schema = "bot",
  ) {
    quoteIdent(schema);
    this.table = qualified(schema, CURSOR_TABLE);
  }

  /** True when the cursor table exists (and the role can see it). */
  async exists(): Promise<boolean> {
    const rows = await this.sql.unsafe("SELECT to_regclass($1)::text AS name", [
      `${this.schema}.${CURSOR_TABLE}`,
    ]);
    return rows[0]?.name != null;
  }

  /** Creates the table when the role may; resolves to whether it exists afterwards. */
  async ensure(): Promise<boolean> {
    if (await this.exists()) return true;
    try {
      await this.sql.unsafe(cursorDdl(this.schema));
    } catch {
      return false;
    }
    return this.exists();
  }

  async get(sourceId: string, table: string): Promise<number> {
    const rows = await this.sql.unsafe(
      `SELECT last_id::text AS last_id FROM ${this.table} WHERE source_id = $1::text AND table_name = $2::text`,
      [sourceId, table],
    );
    return Number(rows[0]?.last_id ?? 0);
  }

  async advance(sourceId: string, table: string, lastId: number, added: number): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO ${this.table} (source_id, table_name, last_id, rows_synced, updated_at)
       VALUES ($1::text, $2::text, $3::int8, $4::int8, now())
       ON CONFLICT (source_id, table_name) DO UPDATE SET
         last_id = GREATEST(${this.table}.last_id, EXCLUDED.last_id),
         rows_synced = ${this.table}.rows_synced + EXCLUDED.rows_synced,
         updated_at = now()`,
      [sourceId, table, lastId, added],
    );
  }
}

/** In-memory store for tests and dry runs. */
export class MemoryCursorStore implements CursorStore {
  readonly cursors = new Map<string, number>();
  readonly rowsSynced = new Map<string, number>();

  async get(sourceId: string, table: string): Promise<number> {
    return this.cursors.get(`${sourceId}/${table}`) ?? 0;
  }

  async advance(sourceId: string, table: string, lastId: number, added = 0): Promise<void> {
    const key = `${sourceId}/${table}`;
    this.cursors.set(key, Math.max(this.cursors.get(key) ?? 0, lastId));
    this.rowsSynced.set(key, (this.rowsSynced.get(key) ?? 0) + added);
  }
}
