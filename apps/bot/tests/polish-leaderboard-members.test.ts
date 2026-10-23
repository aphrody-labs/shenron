/**
 * Rankings leave out the members who left the guild and the bots, with the rule of the guild
 * mirror (`discord_members`): hidden when a row says `present = 0` or `bot = 1`, kept when the
 * mirror does not know them. /top, the /profil rank and the public API agree.
 */
import "./setup"; // must be first
import "./polish-api-env";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { actionLogs, users } from "~/db/schema";
import { ApiServer } from "~/api/server";

const { LevelService } = await import("~/services/LevelService");

const dbs = container.resolve(DatabaseService);
const levels = container.resolve(LevelService);

/** Ranked in this order when everyone is present. */
const ROSTER = [
  { id: "6001", xp: 900, zeni: 90 },
  { id: "6002", xp: 800, zeni: 80 },
  { id: "6003", xp: 700, zeni: 70 },
  { id: "6004", xp: 600, zeni: 60 },
  { id: "6005", xp: 500, zeni: 50 },
] as const;

function mirror(userId: string, state: { present?: number; bot?: number }) {
  dbs.sqlite
    .query(
      `INSERT INTO discord_members (user_id, username, bot, present, synced_at)
       VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT(user_id) DO UPDATE SET bot = excluded.bot, present = excluded.present`,
    )
    .run(userId, `member-${userId}`, state.bot ?? 0, state.present ?? 1);
}

beforeEach(async () => {
  dbs.sqlite.exec("DELETE FROM discord_members");
  dbs.db.delete(actionLogs).run();
  dbs.db.delete(users).run();
  await dbs.db.insert(users).values(ROSTER.map((member) => ({ ...member })));
});

describe("ranking rules", () => {
  test("a mirror that knows nobody leaves everybody ranked", async () => {
    expect((await levels.top(10)).map((u) => u.id)).toEqual(ROSTER.map((m) => m.id));
    expect(await levels.totalUsers()).toBe(5);
  });

  test("a member who left, and a bot, are not ranked; unknown members stay", async () => {
    mirror("6002", { present: 0 }); // left the server
    mirror("6003", { bot: 1 }); // a bot
    mirror("6005", { present: 1 }); // present and known
    // 6004 is absent from the mirror: kept.
    expect((await levels.top(10)).map((u) => u.id)).toEqual(["6001", "6004", "6005"]);
    expect(await levels.totalUsers()).toBe(3);
  });

  test("pagination skips the hidden members without gaps", async () => {
    mirror("6001", { present: 0 });
    mirror("6003", { present: 0 });
    expect((await levels.top(2, 0)).map((u) => u.id)).toEqual(["6002", "6004"]);
    expect((await levels.top(2, 2)).map((u) => u.id)).toEqual(["6005"]);
  });

  test("the /profil rank is the /top position, and a hidden member has none", async () => {
    mirror("6001", { present: 0 });
    mirror("6004", { bot: 1 });
    const top = await levels.top(10);
    expect(top.map((u) => u.id)).toEqual(["6002", "6003", "6005"]);
    for (const [index, row] of top.entries()) {
      expect(await levels.rankOf(row.id)).toBe(index + 1);
    }
    expect(await levels.rankOf("6001")).toBeNull();
    expect(await levels.rankOf("6004")).toBeNull();
  });

  test("a member who comes back is ranked again", async () => {
    mirror("6002", { present: 0 });
    expect((await levels.top(10)).map((u) => u.id)).not.toContain("6002");
    mirror("6002", { present: 1 });
    expect((await levels.top(10)).map((u) => u.id)).toContain("6002");
    expect(await levels.rankOf("6002")).toBe(2);
  });

  test("ties keep the stable order (value, then id) among the visible members", async () => {
    await dbs.db.delete(users);
    await dbs.db
      .insert(users)
      .values(["6103", "6101", "6102", "6104"].map((id) => ({ id, xp: 400 })));
    mirror("6102", { present: 0 });
    expect((await levels.top(10)).map((u) => u.id)).toEqual(["6101", "6103", "6104"]);
    expect(await levels.rankOf("6104")).toBe(3);
  });
});

describe("public leaderboard API", () => {
  // `stats` serves other routes only; the leaderboard routes never touch it.
  const api = new ApiServer({} as never);
  const base = `http://127.0.0.1:${Bun.env.API_PORT}`;

  beforeAll(async () => {
    api.start();
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await fetch(`${base}/api/health`).catch(() => null))?.ok) return;
      await Bun.sleep(25);
    }
  });
  afterAll(async () => {
    await api.stop(true);
  });

  const ranking = async (query: string) => {
    const response = await fetch(`${base}/api/public/leaderboard?${query}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      leaderboard: Array<{ discordId: string; rank: number }>;
    };
    return body.leaderboard;
  };

  test("the XP and zeni rankings omit departed members and bots", async () => {
    mirror("6001", { present: 0 });
    mirror("6003", { bot: 1 });
    const xp = await ranking("metric=xp&limit=51");
    expect(xp.map((row) => row.discordId)).toEqual(["6002", "6004", "6005"]);
    expect(xp.map((row) => row.rank)).toEqual([1, 2, 3]);
    const zeni = await ranking("metric=zeni&limit=52");
    expect(zeni.map((row) => row.discordId)).toEqual(["6002", "6004", "6005"]);
  });

  test("the monthly ranking omits them as well", async () => {
    for (const [index, member] of ROSTER.entries()) {
      await dbs.db.insert(actionLogs).values({
        userId: member.id,
        action: "XP_GAIN",
        meta: JSON.stringify({ amount: 1000 - index * 100 }),
      });
    }
    mirror("6002", { present: 0 });
    const month = await ranking("metric=xp&period=month&limit=53");
    expect(month.map((row) => row.discordId)).toEqual(["6001", "6003", "6004", "6005"]);
  });
});
