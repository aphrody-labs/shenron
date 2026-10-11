// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  migrateEpisodeReplica,
  EPISODE_REPLICA_COLUMNS,
} from "../src/db/migrations/0020_episode_replica";
import {
  planColumns,
  planTable,
  sqliteDefaultEvaluator,
  type SourceColumn,
} from "../src/db/replica-sync";

function fixture(db: Database) {
  db.exec(`CREATE TABLE db_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series TEXT NOT NULL,
    number_in_series INTEGER NOT NULL DEFAULT (0),
    title TEXT NOT NULL,
    official_metadata TEXT,
    custom_extension BLOB
  );
  CREATE INDEX episode_number ON db_episodes(series, number_in_series);
  CREATE TABLE changes (id INTEGER);
  CREATE TRIGGER episode_changed AFTER UPDATE ON db_episodes BEGIN INSERT INTO changes VALUES(NEW.id); END;
  INSERT INTO db_episodes VALUES(10,'DBZ',1,'Known','{"source":"publisher"}',X'ABCD');
  INSERT INTO db_episodes(id,series,number_in_series,title) VALUES(100,'DBZ',2,'Deleted later');
  DELETE FROM db_episodes WHERE id=100;`);
}

test("migration preserves extensions, indexes, triggers and allocation, then replays", () => {
  const db = new Database(":memory:");
  try {
    fixture(db);
    const before = db.query("SELECT * FROM db_episodes").all();
    migrateEpisodeReplica(db);
    migrateEpisodeReplica(db);
    expect(
      db
        .query(
          "SELECT id,series,number_in_series,title,official_metadata,custom_extension FROM db_episodes",
        )
        .all(),
    ).toEqual(before);
    expect(
      db
        .query(
          "SELECT [notnull] AS required, dflt_value AS fallback FROM pragma_table_info('db_episodes') WHERE name='number_in_series'",
        )
        .get(),
    ).toEqual({ required: 0, fallback: null });
    expect(
      db.query("SELECT name FROM sqlite_schema WHERE type='index' AND name='episode_number'").get(),
    ).not.toBeNull();
    db.exec(
      "INSERT INTO db_episodes(series,number_in_series,title) VALUES('SDBH',NULL,'Unnumbered')",
    );
    expect(
      db.query("SELECT id,number_in_series FROM db_episodes WHERE series='SDBH'").get(),
    ).toEqual({ id: 101, number_in_series: null });
    db.exec("UPDATE db_episodes SET title='Edited' WHERE id=10");
    expect(db.query("SELECT * FROM changes").all()).toEqual([{ id: 10 }]);
    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(db_episodes)")
      .all()
      .map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(Object.keys(EPISODE_REPLICA_COLUMNS)));
    expect(db.query("PRAGMA quick_check").get()).toEqual({ quick_check: "ok" });
  } finally {
    db.close();
  }
});

test("canonical column planning preserves an unknown number and primary JSON metadata", () => {
  const db = new Database(":memory:");
  try {
    fixture(db);
    migrateEpisodeReplica(db);
    const source: SourceColumn[] = [
      { name: "id", dataType: "bigint" },
      { name: "number_in_series", dataType: "bigint" },
      { name: "official_metadata", dataType: "jsonb" },
    ];
    const replica = db
      .query<{ name: string; type: string; notnull: number; dflt_value: string | null }, []>(
        "PRAGMA table_info(db_episodes)",
      )
      .all();
    const columns = planColumns(
      "db_episodes",
      source.map((column) => {
        const local = replica.find((value) => value.name === column.name)!;
        return {
          source: column,
          replica: {
            name: local.name,
            type: local.type,
            notNull: !!local.notnull,
            defaultSql: local.dflt_value,
          },
        };
      }),
      new Map(),
      sqliteDefaultEvaluator(db),
    );
    const plan = planTable("db_episodes", columns, [
      { id: 827, number_in_series: null, official_metadata: '{"video":"official"}' },
    ]);
    expect(plan.rows).toEqual([[827, null, '{"video":"official"}']]);
    expect(plan.nullsReplaced).toEqual({});
  } finally {
    db.close();
  }
});

test("coherent WAL backup is recoverable and incoming foreign keys fail without mutation", () => {
  const directory = mkdtempSync(join(tmpdir(), "shenron-episode-migration-"));
  const db = new Database(join(directory, "fixture.sqlite"));
  try {
    db.exec("PRAGMA journal_mode=WAL");
    fixture(db);
    const backup = join(directory, "backup.sqlite");
    db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE referencing_episode (episode_id INTEGER REFERENCES db_episodes(id)); INSERT INTO referencing_episode VALUES(10)",
    );
    expect(() => migrateEpisodeReplica(db)).toThrow("incoming foreign-key review");
    expect(
      db
        .query(
          "SELECT [notnull] AS required FROM pragma_table_info('db_episodes') WHERE name='number_in_series'",
        )
        .get(),
    ).toEqual({ required: 1 });
    const recovered = new Database(backup);
    try {
      expect(recovered.query("PRAGMA quick_check").get()).toEqual({ quick_check: "ok" });
      expect(recovered.query("SELECT count(*) AS n FROM db_episodes").get()).toEqual({ n: 1 });
      migrateEpisodeReplica(recovered);
      expect(
        recovered
          .query(
            "SELECT [notnull] AS required FROM pragma_table_info('db_episodes') WHERE name='number_in_series'",
          )
          .get(),
      ).toEqual({ required: 0 });
    } finally {
      recovered.close();
    }
  } finally {
    db.close();
    Bun.gc(true);
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
