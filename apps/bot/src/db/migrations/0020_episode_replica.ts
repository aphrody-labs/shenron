// SPDX-License-Identifier: Apache-2.0
import type { Database } from "bun:sqlite";

/** Runtime migration: retains locally installed columns and schema objects. */
export const EPISODE_REPLICA_COLUMNS = {
  synopsis_fr: "TEXT",
  official_source_url: "TEXT",
  official_metadata: "TEXT",
  subtitles: "TEXT",
  players: "TEXT",
  availability: "TEXT",
  stream_url: "TEXT",
  stream_headers: "TEXT",
  stream_provider: "TEXT",
  stream_at: "INTEGER",
  streams: "TEXT NOT NULL DEFAULT '{}'",
  players_checked_at: "INTEGER",
  players_repair_failures: "INTEGER NOT NULL DEFAULT 0",
  players_repair_after: "INTEGER",
  stream_checked_at: "INTEGER",
  stream_resolve_failures: "INTEGER NOT NULL DEFAULT 0",
  stream_retry_after: "INTEGER",
} as const;

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** Applied at boot and projected by the canonical replica sync dry run. */
export function migrateEpisodeReplica(sqlite: Database): void {
  const table = sqlite
    .query<{ sql: string }, []>(
      "SELECT sql FROM sqlite_schema WHERE type='table' AND name='db_episodes'",
    )
    .get();
  if (!table) return;
  const columns = sqlite
    .query<{ name: string; notnull: number; hidden: number }, []>("PRAGMA table_xinfo(db_episodes)")
    .all();
  const number = columns.find((column) => column.name === "number_in_series");
  sqlite
    .transaction(() => {
      const current = sqlite
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_schema WHERE type='table' AND name='db_episodes'",
        )
        .get();
      if (current?.sql !== table.sql)
        throw new Error("Episode schema changed before migration lock");
      if (number?.notnull) {
        // Incoming foreign keys must be reviewed before a DROP/rebuild with FK enforcement.
        const foreignKeys = sqlite.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
        if (foreignKeys?.foreign_keys) {
          const tables = sqlite
            .query<{ name: string }, []>(
              "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )
            .all();
          for (const other of tables) {
            const references = sqlite
              .query<{ table: string }, []>(`PRAGMA foreign_key_list(${quote(other.name)})`)
              .all();
            if (references.some((reference) => reference.table === "db_episodes")) {
              throw new Error("Episode replica migration requires incoming foreign-key review");
            }
          }
        }
        const hasSequence = sqlite
          .query("SELECT name FROM sqlite_schema WHERE name='sqlite_sequence'")
          .get();
        const sequence = hasSequence
          ? sqlite
              .query<{ seq: number }, []>(
                "SELECT seq FROM sqlite_sequence WHERE name='db_episodes'",
              )
              .get()?.seq
          : undefined;
        const objects = sqlite
          .query<{ sql: string }, []>(
            "SELECT sql FROM sqlite_schema WHERE tbl_name='db_episodes' AND type IN ('index','trigger') AND sql IS NOT NULL",
          )
          .all();
        let definitions = 0;
        const nullable = table.sql.replace(
          /((?:`number_in_series`|"number_in_series"|\[number_in_series\]|\bnumber_in_series)\s+integer\b)([^,]*)/gi,
          (_match, name: string, constraints: string) => {
            definitions++;
            return (
              name +
              constraints
                .replace(/\s+NOT\s+NULL\b/gi, "")
                .replace(/\s+DEFAULT\s+(?:\(0\)|0)(?=\s|$)/gi, "")
            );
          },
        );
        if (definitions !== 1 || nullable === table.sql) {
          throw new Error("Unrecognized episode number column definition");
        }
        const create = nullable.replace(
          /^CREATE\s+TABLE\s+(?:`db_episodes`|"db_episodes"|\[db_episodes\]|db_episodes)\s*\(/i,
          "CREATE TABLE __episode_replica_0020 (",
        );
        if (create === nullable) throw new Error("Unrecognized episode table definition");
        sqlite.exec(create);
        const names = columns
          .filter((column) => !column.hidden)
          .map((column) => quote(column.name))
          .join(", ");
        sqlite.exec(
          `INSERT INTO __episode_replica_0020 (${names}) SELECT ${names} FROM db_episodes`,
        );
        const changed = sqlite
          .query<{ n: number }, []>(
            `SELECT count(*) AS n FROM (SELECT ${names} FROM db_episodes EXCEPT SELECT ${names} FROM __episode_replica_0020)`,
          )
          .get()!.n;
        const counts = sqlite
          .query<{ original: number; copied: number }, []>(
            "SELECT (SELECT count(*) FROM db_episodes) AS original, (SELECT count(*) FROM __episode_replica_0020) AS copied",
          )
          .get()!;
        if (changed || counts.original !== counts.copied)
          throw new Error("Episode replica copy mismatch");
        sqlite.exec(
          "DROP TABLE db_episodes; ALTER TABLE __episode_replica_0020 RENAME TO db_episodes",
        );
        for (const object of objects) sqlite.exec(object.sql);
        if (sequence !== undefined) {
          sqlite
            .query("UPDATE sqlite_sequence SET seq=max(seq, ?) WHERE name='db_episodes'")
            .run(sequence);
        }
      }
      const present = new Set(columns.map((column) => column.name));
      for (const [name, type] of Object.entries(EPISODE_REPLICA_COLUMNS)) {
        if (!present.has(name))
          sqlite.exec(`ALTER TABLE db_episodes ADD COLUMN ${quote(name)} ${type}`);
      }
    })
    .immediate();
}
