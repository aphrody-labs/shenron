// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  syncMangaSnapshot,
  type MangaTranscriptRow,
} from "../../apps/bot/src/db/manga-search-replica";

function page(id = 500, planche = 1): MangaTranscriptRow {
  return {
    id,
    series: "DB",
    tome: "vol1",
    planche,
    lines: '["Kamehameha"]',
    text: "Kamehameha",
    lang: "fr",
    has_ja: 0,
    line_count: 1,
    char_count: 10,
  };
}

function fixture(): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE db_manga_pages(
    id INTEGER PRIMARY KEY AUTOINCREMENT,series TEXT,tome TEXT,planche INTEGER,
    lines TEXT,text TEXT,lang TEXT,has_ja INTEGER,line_count INTEGER,char_count INTEGER,
    koharu_page_id TEXT,koharu_revision INTEGER,private_note TEXT,
    UNIQUE(series,tome,planche));
    INSERT INTO db_manga_pages VALUES
      (9,'DB','vol1',1,'["old"]','old','fr',0,1,3,'scene-9',7,'keep'),
      (41,'PRIVATE','draft',1,'["private"]','private','fr',0,1,7,'scene-41',8,'private');`);
  return db;
}

describe("atomic manga replica and FTS", () => {
  test("keeps local IDs, Koharu mappings and private rows while indexing only public source identities", () => {
    const db = fixture();
    try {
      const privateBefore = db.query("SELECT * FROM db_manga_pages WHERE id=41").get();
      const result = syncMangaSnapshot(db, [page(), page(501, 2)], 2);
      expect(result.healthy).toBe(true);
      expect(
        db
          .query(
            "SELECT id,koharu_page_id,koharu_revision,private_note FROM db_manga_pages WHERE id=9",
          )
          .get(),
      ).toEqual({ id: 9, koharu_page_id: "scene-9", koharu_revision: 7, private_note: "keep" });
      expect(db.query("SELECT * FROM db_manga_pages WHERE id=41").get()).toEqual(privateBefore);
      expect(
        db.query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'private'").all(),
      ).toEqual([]);
      expect(
        db
          .query(
            "SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha' ORDER BY rowid",
          )
          .all(),
      ).toEqual([{ rowid: 9 }, { rowid: 43 }]);
    } finally {
      db.close();
    }
  });

  test("a failed second write rolls back the first transcription and leaves the old FTS usable", () => {
    const db = fixture();
    try {
      syncMangaSnapshot(db, [page()], 1);
      const before = db.query("SELECT * FROM db_manga_pages ORDER BY id").all();
      db.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON db_manga_pages
        WHEN new.planche=2 BEGIN SELECT RAISE(ABORT,'test failure'); END`);
      expect(() =>
        syncMangaSnapshot(db, [{ ...page(), text: "Changed" }, page(501, 2)], 2),
      ).toThrow("test failure");
      expect(db.query("SELECT * FROM db_manga_pages ORDER BY id").all()).toEqual(before);
      expect(
        db
          .query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha'")
          .all(),
      ).toEqual([{ rowid: 9 }]);
    } finally {
      db.close();
    }
  });

  test("failure during FTS replacement rolls back all preceding source updates", () => {
    const db = fixture();
    try {
      const before = db.query("SELECT * FROM db_manga_pages ORDER BY id").all();
      // A view occupying the index name prevents FTS table creation.
      db.exec(
        "CREATE VIEW manga_pages_fts AS SELECT id AS rowid,text,series,tome,planche,lang FROM db_manga_pages",
      );
      expect(() => syncMangaSnapshot(db, [page()], 1)).toThrow();
      expect(db.query("SELECT * FROM db_manga_pages ORDER BY id").all()).toEqual(before);
      expect(db.query("SELECT type FROM sqlite_master WHERE name='manga_pages_fts'").get()).toEqual(
        { type: "view" },
      );
    } finally {
      db.close();
    }
  });

  test("an automatic SQLite rollback preserves the original error and the usable index", () => {
    const db = fixture();
    try {
      syncMangaSnapshot(db, [page()], 1);
      const before = db.query("SELECT * FROM db_manga_pages ORDER BY id").all();
      db.exec(`CREATE TRIGGER rollback_second BEFORE INSERT ON db_manga_pages
        WHEN new.planche=2 BEGIN SELECT RAISE(ROLLBACK,'source transaction aborted'); END`);
      expect(() =>
        syncMangaSnapshot(db, [{ ...page(), text: "Changed" }, page(501, 2)], 2),
      ).toThrow("source transaction aborted");
      expect(db.inTransaction).toBe(false);
      expect(db.query("SELECT * FROM db_manga_pages ORDER BY id").all()).toEqual(before);
      expect(
        db
          .query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha'")
          .all(),
      ).toEqual([{ rowid: 9 }]);
    } finally {
      db.close();
    }
  });

  test("rejects zero and partial PostgreSQL reads before any local mutation", () => {
    const db = fixture();
    try {
      const before = db.query("SELECT * FROM db_manga_pages ORDER BY id").all();
      expect(() => syncMangaSnapshot(db, [], 0)).toThrow("Empty or partial");
      expect(() => syncMangaSnapshot(db, [page()], 2)).toThrow("Empty or partial");
      expect(db.query("SELECT * FROM db_manga_pages ORDER BY id").all()).toEqual(before);
      expect(db.query("SELECT name FROM sqlite_master WHERE name='manga_pages_fts'").all()).toEqual(
        [],
      );
    } finally {
      db.close();
    }
  });

  test("an unchanged complete snapshot makes no source or index writes", () => {
    const db = fixture();
    try {
      const pages = [page(), page(501, 2)];
      syncMangaSnapshot(db, pages, 2);
      const changes = db.query("SELECT total_changes() AS changes").get();
      const result = syncMangaSnapshot(db, pages, 2);
      expect(result).toMatchObject({
        healthy: true,
        writtenPages: 0,
        unchangedPages: 2,
        indexedChangedPages: 0,
        removedIndexPages: 0,
      });
      expect(db.query("SELECT total_changes() AS changes").get()).toEqual(changes);
    } finally {
      db.close();
    }
  });

  test("one changed transcription updates only its source and index row without dropping other public hits", () => {
    const db = fixture();
    try {
      syncMangaSnapshot(db, [page(), page(501, 2)], 2);
      const result = syncMangaSnapshot(
        db,
        [{ ...page(), text: "Reviewed correction" }, page(501, 2)],
        2,
      );
      expect(result).toMatchObject({
        healthy: true,
        sourcePages: 2,
        indexedPages: 2,
        writtenPages: 1,
        indexedChangedPages: 1,
      });
      expect(
        db
          .query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha'")
          .all(),
      ).toEqual([{ rowid: 43 }]);
      expect(
        db
          .query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'correction'")
          .all(),
      ).toEqual([{ rowid: 9 }]);
      expect(db.query("SELECT koharu_revision FROM db_manga_pages WHERE id=9").get()).toEqual({
        koharu_revision: 7,
      });
    } finally {
      db.close();
    }
  });

  test("a page leaving the complete public scope leaves only the index, keeping its local source history", () => {
    const db = fixture();
    try {
      syncMangaSnapshot(db, [page(), page(501, 2)], 2);
      const previous = db.query("SELECT * FROM db_manga_pages WHERE id=43").get();
      const result = syncMangaSnapshot(db, [page()], 1);
      expect(result).toMatchObject({
        healthy: true,
        writtenPages: 0,
        indexedPages: 1,
        indexedChangedPages: 0,
        removedIndexPages: 1,
      });
      expect(db.query("SELECT * FROM db_manga_pages WHERE id=43").get()).toEqual(previous);
      expect(
        db
          .query("SELECT rowid FROM manga_pages_fts WHERE manga_pages_fts MATCH 'Kamehameha'")
          .all(),
      ).toEqual([{ rowid: 9 }]);
    } finally {
      db.close();
    }
  });

  test("source-only metadata changes avoid index writes and become a complete no-op on replay", () => {
    const db = fixture();
    try {
      syncMangaSnapshot(db, [page()], 1);
      const metadata = { ...page(), lines: '["Kame","hameha"]', line_count: 2 };
      expect(syncMangaSnapshot(db, [metadata], 1)).toMatchObject({
        healthy: true,
        writtenPages: 1,
        indexedChangedPages: 0,
      });
      expect(db.query("SELECT lines,line_count FROM db_manga_pages WHERE id=9").get()).toEqual({
        lines: metadata.lines,
        line_count: 2,
      });
      const changes = db.query("SELECT total_changes() AS changes").get();
      expect(syncMangaSnapshot(db, [metadata], 1)).toMatchObject({
        writtenPages: 0,
        indexedChangedPages: 0,
      });
      expect(db.query("SELECT total_changes() AS changes").get()).toEqual(changes);
    } finally {
      db.close();
    }
  });
});
