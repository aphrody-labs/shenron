import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { ensureWikiReplicaSchema, ensureWikiVisibility } from "../src/db/wiki-visibility";

const columns = (db: Database, table: string) =>
  db
    .query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
    .all(table)
    .map((c) => c.name);

describe("réplica wiki : colonnes absentes des migrations SQL", () => {
  test("une base sans video_url ni db_tools est complétée, de façon idempotente", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE db_episodes (id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
    ensureWikiReplicaSchema(db);
    ensureWikiReplicaSchema(db);
    expect(columns(db, "db_episodes")).toContain("video_url");
    expect(columns(db, "db_tools")).toEqual(
      expect.arrayContaining(["slug", "visible", "archived", "pushed_at", "checked_at"]),
    );
    db.close();
  });

  test("un db_tools ancien reçoit archived, pushed_at et checked_at", () => {
    const db = new Database(":memory:");
    db.exec(
      "CREATE TABLE db_tools (id INTEGER PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL)",
    );
    db.exec("INSERT INTO db_tools (slug, name, url) VALUES ('x', 'X', 'https://example.org')");
    ensureWikiReplicaSchema(db);
    ensureWikiVisibility(db);
    expect(columns(db, "db_tools")).toEqual(
      expect.arrayContaining(["visible", "archived", "pushed_at", "checked_at"]),
    );
    expect(db.query("SELECT visible, archived FROM db_tools").get()).toEqual({
      visible: 1,
      archived: 0,
    });
    db.close();
  });
});
