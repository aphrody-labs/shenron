// SPDX-License-Identifier: Apache-2.0
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  readPublicMangaSnapshot,
  syncMangaSnapshot,
} from "../../apps/bot/scripts/sync-manga-pages-to-sqlite";

const url = process.env.SHENRON_MANGA_TEST_DATABASE_URL;
const enabled = process.env.SHENRON_LIVE === "1" && Boolean(url);

function reviewedDatabaseName(connectionUrl: string): string {
  const parsed = new URL(connectionUrl);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !/^shenron_manga_qa_[a-z0-9_]+$/.test(name)
  ) {
    throw new Error("Live manga tests require a dedicated shenron_manga_qa_* PostgreSQL database");
  }
  return name;
}

async function assertEmptyFixtureDatabase(sql: SQL, name: string): Promise<void> {
  const [identity] = await sql`SELECT current_database() AS name`;
  if (identity?.name !== name)
    throw new Error("Connected database differs from the reviewed QA database");
  const existing = await sql`
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' LIMIT 1`;
  const schemas = await sql`SELECT 1 FROM pg_namespace WHERE nspname='bot'`;
  if (existing.length || schemas.length)
    throw new Error("QA database contains preexisting relations or bot schema");
}

describe("manga QA database guards", () => {
  test("refuses production, generic databases and encoded path tricks without connecting", () => {
    for (const name of [
      "postgres",
      "shenron_site",
      "shenron_manga_qa_",
      "shenron_manga_qa_ok/extra",
      "%73henron_site",
    ]) {
      expect(() => reviewedDatabaseName(`postgres://localhost/${name}`)).toThrow();
    }
    expect(reviewedDatabaseName("postgres://localhost/shenron_manga_qa_fixture")).toBe(
      "shenron_manga_qa_fixture",
    );
  });
});

describe.if(enabled)("native PostgreSQL public manga snapshot → SQLite FTS", () => {
  test("selects visible reader mappings, supports JSON lines, rejects empty reads and rolls back failed sync", async () => {
    const name = reviewedDatabaseName(url!);
    const sql = new SQL(url!);
    const sqlite = new Database(":memory:");
    let ownsSchema = false;
    try {
      await assertEmptyFixtureDatabase(sql, name);
      await sql`CREATE SCHEMA bot`;
      ownsSchema = true;
      // PostgreSQL nullability/types follow bot-schema; no production data is imported.
      await sql`CREATE TABLE bot.db_manga_chapters (
        id integer PRIMARY KEY,series text NOT NULL,chapter_number integer,visible boolean NOT NULL DEFAULT true)`;
      await sql`CREATE TABLE bot.db_manga_pages (
        id integer PRIMARY KEY,series text,tome text,planche integer,lines text,text text,
        lang text,has_ja integer,line_count integer,char_count integer)`;
      await expect(assertEmptyFixtureDatabase(sql, name)).rejects.toThrow("preexisting");
      await expect(readPublicMangaSnapshot(sql)).rejects.toThrow("Empty or partial");
      await sql`INSERT INTO bot.db_manga_chapters(id,series,chapter_number,visible) VALUES
        (10,'DB',1,true),(11,'DB',2,false),(200,'DBS',1,true),(300,'DBFC',1,true),(400,'PRIVATE',1,true)`;
      const fixtures = [
        { id: 1, series: "DB", tome: "vol1", text: "Kamehameha" },
        { id: 2, series: "DBS", tome: "ch200", text: "かめはめ波" },
        { id: 3, series: "DB", tome: "vol2", text: "hidden" },
        { id: 4, series: "DBFC", tome: "vol1", text: "color" },
        { id: 5, series: "PRIVATE", tome: "vol1", text: "private" },
        { id: 6, series: "DBS", tome: "vol1", text: "wrong-edition-key" },
        { id: 7, series: "DB", tome: "ch10", text: "wrong-volume-key" },
      ];
      for (const row of fixtures) {
        await sql`INSERT INTO bot.db_manga_pages VALUES
          (${row.id},${row.series},${row.tome},1,${JSON.stringify([row.text])},${row.text},'fr',0,1,${row.text.length})`;
      }
      const snapshot = await readPublicMangaSnapshot(sql);
      expect(snapshot.expectedCount).toBe(2);
      expect(snapshot.rows.map((row) => row.id)).toEqual([1, 2]);
      expect(snapshot.rows[0]?.lines).toBe('["Kamehameha"]');
      // Exercise the legacy JSON-backed representation decoded to string[] by Bun.SQL.
      await sql`ALTER TABLE bot.db_manga_pages ALTER COLUMN lines TYPE jsonb USING lines::jsonb`;
      const jsonSnapshot = await readPublicMangaSnapshot(sql);
      expect(jsonSnapshot).toEqual(snapshot);
      expect((await sql`SELECT count(*)::integer AS count FROM bot.db_manga_pages`)[0]?.count).toBe(
        fixtures.length,
      );

      sqlite.exec(`CREATE TABLE db_manga_pages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,series TEXT NOT NULL,tome TEXT NOT NULL,planche INTEGER NOT NULL,
        lines TEXT NOT NULL,text TEXT NOT NULL,lang TEXT NOT NULL,has_ja INTEGER NOT NULL,
        line_count INTEGER NOT NULL,char_count INTEGER NOT NULL,koharu_page_id TEXT,koharu_revision INTEGER,
        UNIQUE(series,tome,planche));`);
      expect(syncMangaSnapshot(sqlite, jsonSnapshot.rows, jsonSnapshot.expectedCount).healthy).toBe(
        true,
      );
      expect(
        sqlite
          .query(
            "SELECT count(*) AS count FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha'",
          )
          .get(),
      ).toEqual({ count: 1 });
      expect(
        sqlite
          .query("SELECT count(*) AS count FROM manga_pages_fts WHERE text LIKE '%かめはめ波%'")
          .get(),
      ).toEqual({ count: 1 });
      const before = sqlite.query("SELECT * FROM db_manga_pages ORDER BY id").all();
      sqlite.exec(`CREATE TRIGGER reject_second BEFORE UPDATE ON db_manga_pages
        WHEN old.series='DBS' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END`);
      const changed = jsonSnapshot.rows.map((row) => ({ ...row, text: "Changed fixture" }));
      expect(() => syncMangaSnapshot(sqlite, changed, jsonSnapshot.expectedCount)).toThrow(
        "fixture rollback",
      );
      expect(sqlite.query("SELECT * FROM db_manga_pages ORDER BY id").all()).toEqual(before);
      expect(
        sqlite
          .query(
            "SELECT count(*) AS count FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha'",
          )
          .get(),
      ).toEqual({ count: 1 });
    } finally {
      sqlite.close();
      try {
        if (ownsSchema) await sql`DROP SCHEMA bot CASCADE`;
      } finally {
        await sql.close();
      }
    }
  }, 30000);
});
