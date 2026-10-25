// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { auditMangaIndex, rebuildMangaIndex } from "./rebuild-bot-manga-search";

function fixture(): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE db_manga_pages(
    id INTEGER PRIMARY KEY, series TEXT, tome TEXT, planche INTEGER, text TEXT, lang TEXT,
    lines TEXT, koharu_revision INTEGER
  );
  INSERT INTO db_manga_pages VALUES
    (9,'DB','vol19',71,'Kamehameha été','fr','["source"]',7),
    (42,'DBS','ch1',3,'かめはめ波','ja','["原文"]',8);`);
  return db;
}

describe("bounded manga FTS recovery", () => {
  test("rebuilds searchable FTS with original row IDs, preserving every source column", () => {
    const db = fixture();
    try {
      const source = db.query("SELECT * FROM db_manga_pages ORDER BY id").all();
      const before = auditMangaIndex(db);
      expect(before.indexExists).toBe(false);
      expect(rebuildMangaIndex(db, before).healthy).toBe(true);
      expect(
        db.query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'ete'").all(),
      ).toEqual([{ rowid: 9 }]);
      expect(
        db.query("SELECT rowid FROM manga_pages_fts WHERE text LIKE '%かめはめ波%'").all(),
      ).toEqual([{ rowid: 42 }]);
      expect(db.query("SELECT * FROM db_manga_pages ORDER BY id").all()).toEqual(source);
    } finally {
      db.close();
    }
  });

  test("rejects an empty corpus without creating an empty index", () => {
    const db = fixture();
    try {
      const expected = auditMangaIndex(db);
      db.exec("DELETE FROM db_manga_pages");
      expect(() => rebuildMangaIndex(db, expected)).toThrow("Empty manga corpus");
      expect(db.query("SELECT name FROM sqlite_master WHERE name='manga_pages_fts'").all()).toEqual(
        [],
      );
    } finally {
      db.close();
    }
  });

  test("refuses partial source counts and changed content before replacing a usable index", () => {
    const db = fixture();
    try {
      const expected = auditMangaIndex(db);
      rebuildMangaIndex(db, expected);
      expect(() => rebuildMangaIndex(db, { ...expected, sourcePages: 3 })).toThrow(
        "Source snapshot",
      );
      db.exec("UPDATE db_manga_pages SET text='Changed' WHERE id=9");
      expect(() => rebuildMangaIndex(db, expected)).toThrow("Source snapshot");
      expect(
        db
          .query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha'")
          .all(),
      ).toEqual([{ rowid: 9 }]);
    } finally {
      db.close();
    }
  });

  test("detects stale metadata and rebuilds it idempotently", () => {
    const db = fixture();
    try {
      const expected = auditMangaIndex(db);
      rebuildMangaIndex(db, expected);
      db.exec("UPDATE manga_pages_fts SET tome='wrong' WHERE rowid=42");
      expect(auditMangaIndex(db).healthy).toBe(false);
      expect(rebuildMangaIndex(db, expected).healthy).toBe(true);
      expect(rebuildMangaIndex(db, expected).sourceSha256).toBe(expected.sourceSha256);
    } finally {
      db.close();
    }
  });

  test("rejects blank transcription and duplicate source identity", () => {
    const db = fixture();
    try {
      db.exec("UPDATE db_manga_pages SET text='' WHERE id=9");
      expect(() => auditMangaIndex(db)).toThrow("Incomplete manga corpus");
      db.exec("UPDATE db_manga_pages SET text='restored' WHERE id=9");
      db.exec(
        "INSERT INTO db_manga_pages SELECT 50, series,tome,planche,text,lang,lines,koharu_revision FROM db_manga_pages WHERE id=9",
      );
      expect(() => auditMangaIndex(db)).toThrow("duplicate page identity");
    } finally {
      db.close();
    }
  });

  test("SQLITE_FULL remains observable after SQLite automatically rolls back index creation", () => {
    const db = fixture();
    try {
      const expected = auditMangaIndex(db);
      const before = db.query("SELECT * FROM db_manga_pages ORDER BY id").all();
      const pages = Number(Object.values(db.query("PRAGMA page_count").get()!)[0]);
      db.exec(`PRAGMA max_page_count=${pages}`);
      let failure: unknown;
      try {
        rebuildMangaIndex(db, expected);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: "SQLITE_FULL" });
      expect(db.inTransaction).toBe(false);
      expect(db.query("SELECT * FROM db_manga_pages ORDER BY id").all()).toEqual(before);
      expect(db.query("SELECT name FROM sqlite_master WHERE name='manga_pages_fts'").all()).toEqual(
        [],
      );
    } finally {
      db.close();
    }
  });

  test("a nested failure rolls back only its savepoint and leaves caller work committable", () => {
    const db = fixture();
    try {
      const expected = auditMangaIndex(db);
      db.exec(
        "CREATE TABLE caller_work(value TEXT); BEGIN IMMEDIATE; INSERT INTO caller_work VALUES('keep')",
      );
      expect(() => rebuildMangaIndex(db, { ...expected, sourcePages: 99 })).toThrow(
        "Source snapshot",
      );
      expect(db.inTransaction).toBe(true);
      db.exec("COMMIT");
      expect(db.query("SELECT value FROM caller_work").all()).toEqual([{ value: "keep" }]);
    } finally {
      db.close();
    }
  });
});
