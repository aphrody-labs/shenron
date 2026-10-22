import "./setup";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { GuildMirrorStore, type MemberRow } from "../src/services/GuildMirrorService";

function migrated() {
  const db = new Database(":memory:");
  migrate(drizzle(db), { migrationsFolder: join(import.meta.dir, "../src/db/migrations") });
  return db;
}

const member = (id: string, extra: Partial<MemberRow> = {}): MemberRow => ({
  user_id: id,
  username: `user${id}`,
  global_name: null,
  nickname: null,
  avatar_hash: null,
  guild_avatar_hash: null,
  bot: 0,
  joined_at: 1_700_000_000_000,
  premium_since: null,
  timeout_until: null,
  pending: 0,
  role_ids: "[]",
  top_role_id: null,
  ...extra,
});

const role = (id: string, name: string) => ({
  id,
  name,
  color: 0,
  position: 1,
  hoist: 0,
  managed: 0,
  mentionable: 0,
  permissions: "0",
  icon: null,
  unicode_emoji: null,
  member_count: 0,
});

const channel = (id: string, name: string) => ({
  id,
  name,
  type: 0,
  parent_id: null,
  position: 0,
  topic: null,
  nsfw: 0,
  rate_limit: 0,
});

describe("miroir du serveur Discord", () => {
  test("la migration 0022 crée les trois tables", () => {
    const db = migrated();
    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);
    expect(tables).toEqual(
      expect.arrayContaining(["discord_members", "discord_roles", "discord_channels"]),
    );
    db.close();
  });

  test("une synchro complète marque les absents sans les supprimer", async () => {
    const db = migrated();
    const store = new GuildMirrorStore(db);
    store.replaceAll({
      members: [member("1"), member("2", { premium_since: 1, role_ids: '["10"]' })],
      roles: [role("10", "Saiyan"), role("11", "Namek")],
      channels: [channel("100", "général"), channel("101", "bot")],
    });
    expect(store.stats()).toMatchObject({
      membersPresent: 2,
      membersLeft: 0,
      boosters: 1,
      roles: 2,
      channels: 2,
    });

    await Bun.sleep(2);
    const gone = store.replaceAll({
      members: [member("2", { nickname: "Vegeta" })],
      roles: [role("10", "Saiyan")],
      channels: [channel("100", "général")],
    });
    expect(gone).toEqual({ membersLeft: 1, rolesDeleted: 1, channelsDeleted: 1 });
    expect(store.stats()).toMatchObject({
      membersPresent: 1,
      membersLeft: 1,
      roles: 1,
      channels: 1,
    });
    expect(db.query("SELECT COUNT(*) n FROM discord_members").get()).toEqual({ n: 2 });
    expect(store.findMembers("Vege")).toHaveLength(1);
    db.close();
  });

  test("un membre qui revient redevient présent", () => {
    const db = migrated();
    const store = new GuildMirrorStore(db);
    store.upsertMembers([member("7")]);
    store.markMemberLeft("7");
    expect(db.query("SELECT present, left_at IS NOT NULL l FROM discord_members").get()).toEqual({
      present: 0,
      l: 1,
    });
    store.upsertMembers([member("7")]);
    expect(db.query("SELECT present, left_at FROM discord_members").get()).toEqual({
      present: 1,
      left_at: null,
    });
    db.close();
  });
});
