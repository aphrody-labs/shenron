/**
 * XP of the mini-games against the real test database: credited through `LevelService.addXP`
 * with `source: "game"`, never multiplied (not even by a role boosted x100,000 in the database),
 * capped over a rolling 24 h in the `XP_GAIN` ledger, level-ups through the usual flow, and the
 * anti-farm caps of the zeni (daily wins, pair of players) cutting the win XP down to
 * participation.
 */
import "./setup"; // must be first
import { afterEach, describe, expect, mock, test } from "bun:test";
import { container } from "tsyringe";
import { and, eq } from "drizzle-orm";
import type { GuildMember } from "discord.js";
import { DatabaseService } from "~/db/index";
import { actionLogs, economyFlags, guildSettings, users } from "~/db/schema";
import { GAME_XP_DEFAULTS, gameXpAward, gameXpDailyCap } from "~/lib/game-xp";
import { RACE_LEVEL_ROLES } from "~/lib/race-levels";
import { setLevelThresholds } from "~/lib/xp";
import { loadXpGainLimits, singleGainCeiling } from "~/lib/xp-boosts";

const { GameRewardService } = await import("~/services/GameRewardService");
const { SettingsService, XP_BOOST_ROLE_PREFIX } = await import("~/services/SettingsService");

// Level 10 = 90 000 XP, level 11 = 500 000 XP: a span of 410 000 around the test members.
setLevelThresholds([
  { level: 1, xp: 100 },
  { level: 5, xp: 3_000 },
  { level: 9, xp: 50_000 },
  { level: 10, xp: 90_000 },
  { level: 11, xp: 500_000 },
  { level: 12, xp: 3_000_000 },
  { level: 15, xp: 150_000_000 },
  { level: 20, xp: 160_000_000_000 },
]);
const L10 = 90_000;
const WIN = gameXpAward(L10, "win"); // 8 200
const PLAY = gameXpAward(L10, "play"); // 1 640
const DAILY_CAP = gameXpDailyCap(L10); // 41 000

const dbs = container.resolve(DatabaseService);
const rewards = container.resolve(GameRewardService);
const settings = container.resolve(SettingsService);

async function setSetting(key: string, value: string | null) {
  if (value === null) await dbs.db.delete(guildSettings).where(eq(guildSettings.key, key));
  else {
    await dbs.db
      .insert(guildSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: guildSettings.key, set: { value } });
  }
  settings.invalidate();
}

/** Limits as tuned in production: a normal message or voice tick is far above a game award. */
async function productionLimits() {
  await setSetting("xp.multiplier.max", "100000");
  await setSetting("xp.message.max", "500");
  await setSetting("xp.voice.per_minute", "10000");
}

async function seedUser(id: string, xp: number, patch: Partial<typeof users.$inferInsert> = {}) {
  await dbs.db.delete(actionLogs).where(eq(actionLogs.userId, id));
  await dbs.db.delete(economyFlags).where(eq(economyFlags.userId, id));
  await dbs.db.delete(users).where(eq(users.id, id));
  await dbs.db.insert(users).values({ id, xp, lastLevelReached: 10, ...patch });
}

const xpOf = async (id: string) =>
  (await dbs.db.select().from(users).where(eq(users.id, id)).get())!.xp;

async function gameLedger(id: string) {
  const rows = await dbs.db
    .select()
    .from(actionLogs)
    .where(and(eq(actionLogs.userId, id), eq(actionLogs.action, "XP_GAIN")));
  return rows.map((r) => JSON.parse(r.meta ?? "{}") as { amount: number; source: string });
}

function fakeMember(id: string, roleIds: string[] = []) {
  const held = new Set(roleIds);
  const add = mock(async (rid: string) => held.add(rid));
  const value = {
    id,
    user: { bot: false },
    client: { channels: { fetch: async () => null }, guilds: { cache: new Map() } },
    roles: { cache: { has: (r: string) => held.has(r) }, remove: mock(async () => {}), add },
    guild: {
      roles: {
        cache: new Map(Object.values(RACE_LEVEL_ROLES.saiyan).map((r) => [r, { position: 0 }])),
        fetch: async () => null,
      },
      members: { me: null },
    },
  } as unknown as GuildMember;
  return { value, held, add };
}

afterEach(async () => {
  for (const key of [
    "games.xp.enabled",
    "games.xp.daily_ratio",
    "games.daily_reward_cap",
    "games.pair_reward_cap",
    "xp.multiplier.max",
    "xp.message.max",
    "xp.voice.per_minute",
  ]) {
    await setSetting(key, null);
  }
});

describe("grantGameXp", () => {
  test("credits the share of the span with source game, in the ledger", async () => {
    await productionLimits();
    await seedUser("gxp-basic", L10);
    const grant = await rewards.grantGameXp({ userId: "gxp-basic", outcome: "win", game: "test" });
    expect(grant).toMatchObject({ xp: WIN, capped: false, levelUp: false });
    expect(await xpOf("gxp-basic")).toBe(L10 + WIN);
    expect(await gameLedger("gxp-basic")).toEqual([
      expect.objectContaining({ amount: WIN, source: "game" }),
    ]);
    expect(await rewards.gameXpLastDay("gxp-basic")).toBe(WIN);
  });

  test("each outcome pays its own share: win, draw, podium, play", async () => {
    await productionLimits();
    await seedUser("gxp-outcomes", L10);
    const got: Record<string, number> = {};
    for (const outcome of ["win", "draw", "podium", "play"] as const) {
      got[outcome] = (await rewards.grantGameXp({ userId: "gxp-outcomes", outcome })).xp;
    }
    expect(got).toEqual({ win: 8_200, draw: 4_100, podium: 4_100, play: 1_640 });
  });

  test("never multiplied: a role boosted x100 000, the Saiyan race and Zenkai change nothing", async () => {
    await productionLimits();
    const boostedRole = "987654321098765432";
    await settings.set(`${XP_BOOST_ROLE_PREFIX}${boostedRole}`, "100000");
    expect(await settings.getXpBoostRoles()).toContainEqual({
      roleId: boostedRole,
      multiplier: 100_000,
    });
    // Control: a plain member.
    await seedUser("gxp-plain", L10);
    const plain = await rewards.grantGameXp({ userId: "gxp-plain", outcome: "win" });
    // The same member, boosted in every way the messages know about.
    await seedUser("gxp-boosted", L10, {
      race: "saiyan",
      raceBoostUntil: new Date(Date.now() + 3_600_000),
    });
    const boosted = fakeMember("gxp-boosted", [boostedRole]);
    const grant = await rewards.grantGameXp({
      userId: "gxp-boosted",
      outcome: "win",
      member: boosted.value,
    });
    expect(plain.xp).toBe(WIN);
    expect(grant.xp).toBe(WIN);
    expect(await xpOf("gxp-boosted")).toBe(L10 + WIN);
    // grantWin goes through the same path.
    await seedUser("gxp-boosted-win", L10, {
      race: "saiyan",
      raceBoostUntil: new Date(Date.now() + 3_600_000),
    });
    const viaWin = await rewards.grantWin({
      userId: "gxp-boosted-win",
      amount: 100,
      member: fakeMember("gxp-boosted-win", [boostedRole]).value,
    });
    expect(viaWin.xp.xp).toBe(WIN);
    expect(await xpOf("gxp-boosted-win")).toBe(L10 + WIN);
  });

  test("no fusion share: the partner of a fusion receives nothing", async () => {
    await productionLimits();
    await seedUser("gxp-fuse-a", L10);
    await seedUser("gxp-fuse-b", L10);
    await dbs.sqlite
      .query("INSERT INTO fusions (user_a, user_b, created_at) VALUES (?, ?, ?)")
      .run("gxp-fuse-a", "gxp-fuse-b", Date.now());
    await rewards.grantGameXp({ userId: "gxp-fuse-a", outcome: "win" });
    expect(await xpOf("gxp-fuse-b")).toBe(L10);
  });

  test("rolling 24 h cap: the remainder, then nothing; older gains do not count", async () => {
    await productionLimits();
    await seedUser("gxp-cap", L10);
    const day = 86_400_000;
    await dbs.db.insert(actionLogs).values([
      // Inside the window: 40 000 of the 41 000 allowed.
      {
        userId: "gxp-cap",
        action: "XP_GAIN",
        meta: JSON.stringify({ amount: 40_000, source: "game" }),
        createdAt: new Date(Date.now() - 3_600_000),
      },
      // Outside the window, and not a game: ignored.
      {
        userId: "gxp-cap",
        action: "XP_GAIN",
        meta: JSON.stringify({ amount: 900_000, source: "game" }),
        createdAt: new Date(Date.now() - day - 3_600_000),
      },
      {
        userId: "gxp-cap",
        action: "XP_GAIN",
        meta: JSON.stringify({ amount: 900_000, source: "message" }),
        createdAt: new Date(Date.now() - 3_600_000),
      },
    ]);
    expect(await rewards.gameXpLastDay("gxp-cap")).toBe(40_000);
    expect(DAILY_CAP).toBe(41_000);

    const first = await rewards.grantGameXp({ userId: "gxp-cap", outcome: "win" });
    expect(first).toMatchObject({ xp: 1_000, capped: true });
    const second = await rewards.grantGameXp({ userId: "gxp-cap", outcome: "win" });
    expect(second).toMatchObject({ xp: 0, capped: true, levelUp: false });
    expect(await xpOf("gxp-cap")).toBe(L10 + 1_000);
    expect(await rewards.gameXpLastDay("gxp-cap")).toBe(DAILY_CAP);
  });

  test("the same results settled together share one cap", async () => {
    await productionLimits();
    await setSetting("games.xp.daily_ratio", "0.05"); // cap 20 500
    await seedUser("gxp-parallel", L10);
    const grants = await Promise.all(
      Array.from({ length: 5 }, () =>
        rewards.grantGameXp({ userId: "gxp-parallel", outcome: "win" }),
      ),
    );
    const total = grants.reduce((sum, g) => sum + g.xp, 0);
    expect(total).toBe(20_500);
    expect(await xpOf("gxp-parallel")).toBe(L10 + 20_500);
    expect(grants.filter((g) => g.capped)).toHaveLength(3);
  });

  test("disabled by games.xp.enabled: nothing credited, nothing logged", async () => {
    await productionLimits();
    await setSetting("games.xp.enabled", "false");
    await seedUser("gxp-off", L10);
    const grant = await rewards.grantGameXp({ userId: "gxp-off", outcome: "win" });
    expect(grant).toMatchObject({ xp: 0, capped: false, levelUp: false });
    expect(await xpOf("gxp-off")).toBe(L10);
    expect(await gameLedger("gxp-off")).toHaveLength(0);
  });

  test("a frozen account earns nothing and is not told about a cap", async () => {
    await productionLimits();
    await seedUser("gxp-frozen", L10, { zeniFrozen: true });
    const grant = await rewards.grantGameXp({ userId: "gxp-frozen", outcome: "win" });
    expect(grant).toMatchObject({ xp: 0, capped: false });
    expect(await xpOf("gxp-frozen")).toBe(L10);
  });

  test("an unknown member is created at level 0: the floor never beats the daily cap", async () => {
    await productionLimits();
    await dbs.db.delete(users).where(eq(users.id, "gxp-new"));
    // Test curve: the first tier is 100 XP, so the cap of level 0 is 10 XP, below the floor of 25.
    expect(gameXpAward(0, "play")).toBe(GAME_XP_DEFAULTS.min);
    const grant = await rewards.grantGameXp({ userId: "gxp-new", outcome: "play" });
    expect(grant).toMatchObject({ xp: gameXpDailyCap(0), capped: true });
    expect(await xpOf("gxp-new")).toBe(gameXpDailyCap(0));
  });

  test("never asks for more than the single-gain ceiling: no spike flag, no freeze", async () => {
    // Default limits (x10): the ceiling is far below the 8 200 XP of a level-10 win.
    const ceiling = singleGainCeiling(await loadXpGainLimits(settings), "game");
    expect(ceiling).toBeLessThan(WIN);
    await seedUser("gxp-ceiling", L10);
    const grant = await rewards.grantGameXp({ userId: "gxp-ceiling", outcome: "win" });
    expect(grant.xp).toBe(ceiling);
    expect(await xpOf("gxp-ceiling")).toBe(L10 + ceiling);
    const row = (await dbs.db.select().from(users).where(eq(users.id, "gxp-ceiling")).get())!;
    expect(row.zeniFrozen).toBe(false);
    expect(
      await dbs.db.select().from(economyFlags).where(eq(economyFlags.userId, "gxp-ceiling")),
    ).toHaveLength(0);
  });
});

describe("level-up", () => {
  test("crossing a tier runs the usual flow: tier roles, level zeni, one LEVEL_UP", async () => {
    await productionLimits();
    // 100 XP short of level 11: a win carries the member over.
    await seedUser("gxp-up", 500_000 - 100);
    const member = fakeMember("gxp-up");
    const grant = await rewards.grantGameXp({
      userId: "gxp-up",
      outcome: "win",
      member: member.value,
    });
    expect(grant).toMatchObject({ levelUp: true, oldLevel: 10, newLevel: 11, xp: WIN });
    // Tier roles of the Saiyan ladder up to level 11 are placed on the member.
    expect(member.add.mock.calls.map((c) => c[0]).toSorted()).toEqual(
      [2, 5, 8].map((l) => RACE_LEVEL_ROLES.saiyan[l]!).toSorted(),
    );
    const levelUps = await dbs.db
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.userId, "gxp-up"), eq(actionLogs.action, "LEVEL_UP")));
    expect(levelUps).toHaveLength(1);
    expect(JSON.parse(levelUps[0]!.meta!)).toMatchObject({ level: 11, fromLevel: 10 });
    // `zeni.per_level` for the level crossed.
    const row = (await dbs.db.select().from(users).where(eq(users.id, "gxp-up")).get())!;
    expect(row.zeni).toBeGreaterThan(0);
    expect(row.lastLevelReached).toBe(11);
  });

  test("a result that stays in the tier announces nothing", async () => {
    await productionLimits();
    await seedUser("gxp-stay", L10);
    const member = fakeMember("gxp-stay");
    const grant = await rewards.grantGameXp({
      userId: "gxp-stay",
      outcome: "play",
      member: member.value,
    });
    expect(grant.levelUp).toBe(false);
    expect(member.add).not.toHaveBeenCalled();
    expect(
      await dbs.db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.userId, "gxp-stay"), eq(actionLogs.action, "LEVEL_UP"))),
    ).toHaveLength(0);
  });

  test("without a member and without a client the level is still credited", async () => {
    await productionLimits();
    await seedUser("gxp-nomember", 500_000 - 100);
    const grant = await rewards.grantGameXp({ userId: "gxp-nomember", outcome: "win" });
    expect(grant).toMatchObject({ levelUp: true, newLevel: 11 });
    expect(await xpOf("gxp-nomember")).toBe(500_000 - 100 + WIN);
  });
});

describe("anti-farm caps cut the XP of a win", () => {
  test("daily wins cap reached: the zeni and the win XP stop, participation stays", async () => {
    await productionLimits();
    await setSetting("games.daily_reward_cap", "0");
    await seedUser("gxp-dailywins", L10);
    const result = await rewards.grantWin({ userId: "gxp-dailywins", amount: 150 });
    expect(result).toMatchObject({ paid: 0, blocked: "daily-cap" });
    expect(result.xp.xp).toBe(PLAY);
    expect(result.xp.xp).toBeLessThan(WIN);
    expect(await xpOf("gxp-dailywins")).toBe(L10 + PLAY);
  });

  test("pair cap: three paid wins against the same opponent, the fourth is participation", async () => {
    await productionLimits();
    await seedUser("gxp-pair-main", L10);
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(
        await rewards.grantWin({
          userId: "gxp-pair-main",
          amount: 150,
          opponentId: "gxp-pair-alt",
        }),
      );
    }
    expect(results.slice(0, 3).map((r) => [r.paid, r.xp.xp])).toEqual([
      [150, WIN],
      [150, WIN],
      [150, WIN],
    ]);
    expect(results[3]).toMatchObject({ paid: 0, blocked: "pair-cap" });
    expect(results[3]!.xp.xp).toBe(PLAY);
    expect(await xpOf("gxp-pair-main")).toBe(L10 + 3 * WIN + PLAY);
  });

  test("staked duels (no grantWin) obey the same pair cap through opponentId", async () => {
    await productionLimits();
    await seedUser("gxp-stake-main", L10);
    const outcomes = [];
    for (let i = 0; i < 4; i++) {
      const g = await rewards.grantGameXp({
        userId: "gxp-stake-main",
        outcome: "win",
        opponentId: "gxp-stake-alt",
      });
      outcomes.push(g.xp);
    }
    expect(outcomes).toEqual([WIN, WIN, WIN, PLAY]);
  });

  test("a paid win gives the win share, not both", async () => {
    await productionLimits();
    await seedUser("gxp-paid", L10);
    const result = await rewards.grantWin({ userId: "gxp-paid", amount: 150 });
    expect(result).toMatchObject({ paid: 150, blocked: null });
    expect(result.xp.xp).toBe(WIN);
    expect(await xpOf("gxp-paid")).toBe(L10 + WIN);
    expect(await gameLedger("gxp-paid")).toHaveLength(1);
  });

  test("with the zeni win at 0 the XP of the win is still given", async () => {
    await productionLimits();
    await seedUser("gxp-nozeni", L10);
    const result = await rewards.grantWin({ userId: "gxp-nozeni", amount: 0 });
    expect(result).toMatchObject({ paid: 0, blocked: null });
    expect(result.xp.xp).toBe(WIN);
  });

  test("the daily XP cap also bounds a win: no XP past the cap, zeni unaffected", async () => {
    await productionLimits();
    await seedUser("gxp-capwin", L10);
    await dbs.db.insert(actionLogs).values({
      userId: "gxp-capwin",
      action: "XP_GAIN",
      meta: JSON.stringify({ amount: DAILY_CAP, source: "game" }),
    });
    const result = await rewards.grantWin({ userId: "gxp-capwin", amount: 150 });
    expect(result).toMatchObject({ paid: 150, blocked: null });
    expect(result.xp).toMatchObject({ xp: 0, capped: true });
    expect(await xpOf("gxp-capwin")).toBe(L10);
  });
});
