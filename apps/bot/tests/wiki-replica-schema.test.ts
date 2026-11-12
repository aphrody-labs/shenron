import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { and, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";

import { actionLogs, levelRewards, users } from "../src/db/schema";
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
    db.exec("INSERT INTO db_tools (slug, name, url) VALUES ('x', 'X', 'https://gemini.google.com')");
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

  test("une réplica manga reçoit l'identité et la révision Koharu", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE db_manga_pages (id INTEGER PRIMARY KEY, series TEXT NOT NULL)");
    ensureWikiReplicaSchema(db);
    ensureWikiReplicaSchema(db);
    expect(columns(db, "db_manga_pages")).toEqual(
      expect.arrayContaining(["koharu_page_id", "koharu_revision"]),
    );
    db.close();
  });
});

describe("base migrée : colonnes du schéma Drizzle lues à chaque requête", () => {
  const migrated = () => {
    const db = new Database(":memory:");
    migrate(drizzle(db), { migrationsFolder: join(import.meta.dir, "../src/db/migrations") });
    ensureWikiReplicaSchema(db);
    return db;
  };

  test("users et level_rewards ont toutes leurs colonnes Drizzle", () => {
    const db = migrated();
    for (const table of [users, levelRewards]) {
      const config = getTableConfig(table);
      expect(columns(db, config.name)).toEqual(
        expect.arrayContaining(config.columns.map((c) => c.name)),
      );
    }
    db.close();
  });

  test("le classement mensuel lie la date de coupure par la colonne", async () => {
    const db = migrated();
    const orm = drizzle(db);
    await orm.insert(users).values({ id: "u1", xp: 10 });
    await orm.insert(actionLogs).values({
      userId: "u1",
      action: "XP_GAIN",
      meta: JSON.stringify({ amount: 7 }),
    });
    const since = new Date(Date.UTC(2000, 0, 1));
    const rows = await orm
      .select({ id: actionLogs.userId })
      .from(actionLogs)
      .where(and(eq(actionLogs.action, "XP_GAIN"), gte(actionLogs.createdAt, since)));
    expect(rows).toEqual([{ id: "u1" }]);
    expect(await orm.select({ frozen: users.zeniFrozen }).from(users)).toEqual([{ frozen: false }]);
    db.close();
  });
});
