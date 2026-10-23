/**
 * XP of the mini-games, pure rules: share of the tier span per outcome, floor, maximum level,
 * rolling 24 h cap, settings loading and the result lines that show the real gains.
 */
import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import {
  GAME_XP_DEFAULTS,
  gameXpAward,
  gameXpDailyCap,
  gameXpSpan,
  gameXpWithinCap,
  loadGameXpConfig,
  type GameXpConfig,
  type GameXpGrant,
} from "~/lib/game-xp";
import { setLevelThresholds, xpProgress } from "~/lib/xp";
import { grantLine, playerRewardLine, rewardText } from "~/services/games/duel";

// The active exponential curve of production: level 10 = 90 000 XP, level 15 = 150 M XP and
// level 20 = 160 G XP (the steps in between are interpolated for the test).
const CURVE: Array<[number, number]> = [
  [1, 100],
  [2, 300],
  [3, 700],
  [4, 1_500],
  [5, 3_000],
  [6, 6_000],
  [7, 12_000],
  [8, 25_000],
  [9, 50_000],
  [10, 90_000],
  [11, 500_000],
  [12, 3_000_000],
  [13, 15_000_000],
  [14, 60_000_000],
  [15, 150_000_000],
  [16, 1_000_000_000],
  [17, 10_000_000_000],
  [18, 40_000_000_000],
  [19, 90_000_000_000],
  [20, 160_000_000_000],
];
setLevelThresholds(CURVE.map(([level, xp]) => ({ level, xp })));

const cfg = (patch: Partial<GameXpConfig> = {}): GameXpConfig => ({
  ...GAME_XP_DEFAULTS,
  ...patch,
});

describe("gameXpSpan", () => {
  test("gap between the reached tier and the next one", () => {
    expect(gameXpSpan(90_000)).toBe(410_000); // level 10 -> 11
    expect(gameXpSpan(99_999)).toBe(410_000);
    expect(gameXpSpan(150_000_000)).toBe(850_000_000); // level 15 -> 16
    expect(gameXpSpan(xpProgress(95_000).floor)).toBe(xpProgress(95_000).span);
  });

  test("before the first tier the span is the first tier itself", () => {
    expect(gameXpSpan(0)).toBe(100);
    expect(gameXpSpan(99)).toBe(100);
  });

  test("at the maximum level the gap of the last tier stands in", () => {
    expect(gameXpSpan(160_000_000_000)).toBe(70_000_000_000);
    expect(gameXpSpan(900_000_000_000)).toBe(70_000_000_000);
  });

  test("garbage in, zero or the first span out, never NaN", () => {
    expect(gameXpSpan(Number.NaN)).toBe(100);
    expect(gameXpSpan(-5)).toBe(100);
    expect(Number.isFinite(gameXpSpan(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe("gameXpAward", () => {
  test("win is 2 % of the span, draw and podium 1 %, play 0.4 %", () => {
    // Level 10: span 410 000.
    expect(gameXpAward(90_000, "win", cfg())).toBe(8_200);
    expect(gameXpAward(90_000, "draw", cfg())).toBe(4_100);
    expect(gameXpAward(90_000, "podium", cfg())).toBe(4_100);
    expect(gameXpAward(90_000, "play", cfg())).toBe(1_640);
  });

  test("the share follows the level of the curve, from 1 to 20", () => {
    // Level 15: span 850 M. Level 20 (max): span 70 G.
    expect(gameXpAward(150_000_000, "win")).toBe(17_000_000);
    expect(gameXpAward(160_000_000_000, "win")).toBe(1_400_000_000);
    expect(gameXpAward(160_000_000_000, "play")).toBe(280_000_000);
    for (const [level, xp] of CURVE.slice(0, -1)) {
      const span = gameXpSpan(xp);
      expect(span).toBeGreaterThan(0);
      expect(gameXpAward(xp, "win")).toBe(Math.max(25, Math.round(span * 0.02)));
      expect(level).toBeGreaterThan(0);
    }
  });

  test("an award never reaches the next tier by itself", () => {
    for (const [, xp] of CURVE.slice(0, -1)) {
      const span = gameXpSpan(xp);
      const award = gameXpAward(xp, "win", cfg({ min: 0 }));
      expect(award).toBeLessThan(span);
    }
  });

  test("the floor lifts small spans", () => {
    expect(gameXpAward(0, "win")).toBe(25); // span 100 -> 2 XP -> floor
    expect(gameXpAward(0, "play")).toBe(25);
    expect(gameXpAward(0, "win", cfg({ min: 7 }))).toBe(7);
    expect(gameXpAward(0, "win", cfg({ min: 0 }))).toBe(2);
  });

  test("settings reshape the ratios", () => {
    const wide = cfg({ winRatio: 0.05, drawRatio: 0.03, playRatio: 0.01 });
    expect(gameXpAward(90_000, "win", wide)).toBe(20_500);
    expect(gameXpAward(90_000, "draw", wide)).toBe(12_300);
    expect(gameXpAward(90_000, "podium", wide)).toBe(12_300);
    expect(gameXpAward(90_000, "play", wide)).toBe(4_100);
  });

  test("disabled: nothing, whatever the outcome", () => {
    for (const outcome of ["win", "draw", "podium", "play"] as const) {
      expect(gameXpAward(90_000, outcome, cfg({ enabled: false }))).toBe(0);
    }
    expect(gameXpDailyCap(90_000, cfg({ enabled: false }))).toBe(0);
  });

  test("the result is always a safe non-negative integer", () => {
    const award = gameXpAward(160_000_000_000, "win", cfg({ winRatio: 1e30 }));
    expect(Number.isSafeInteger(award)).toBe(true);
    expect(gameXpAward(90_000, "win", cfg({ winRatio: Number.NaN, min: 0 }))).toBe(0);
  });
});

describe("daily cap", () => {
  test("a tenth of the current span", () => {
    expect(gameXpDailyCap(90_000)).toBe(41_000);
    expect(gameXpDailyCap(160_000_000_000)).toBe(7_000_000_000);
    expect(gameXpDailyCap(90_000, cfg({ dailyRatio: 0.25 }))).toBe(102_500);
  });

  test("five wins fill the day at level 10, the sixth gives nothing", () => {
    let used = 0;
    const granted: number[] = [];
    for (let i = 0; i < 6; i++) {
      const { xp, capped } = gameXpWithinCap(gameXpAward(90_000, "win"), used, 90_000);
      granted.push(xp);
      used += xp;
      if (i === 5) expect(capped).toBe(true);
    }
    expect(granted).toEqual([8_200, 8_200, 8_200, 8_200, 8_200, 0]);
    expect(used).toBeLessThanOrEqual(gameXpDailyCap(90_000));
  });

  test("the remainder is given, then the award is reported as capped", () => {
    expect(gameXpWithinCap(8_200, 40_000, 90_000)).toEqual({ xp: 1_000, capped: true });
    expect(gameXpWithinCap(8_200, 41_000, 90_000)).toEqual({ xp: 0, capped: true });
    expect(gameXpWithinCap(8_200, 99_999_999, 90_000)).toEqual({ xp: 0, capped: true });
  });

  test("room left: the award passes untouched and is not capped", () => {
    expect(gameXpWithinCap(1_640, 0, 90_000)).toEqual({ xp: 1_640, capped: false });
    expect(gameXpWithinCap(1_640, -10, 90_000)).toEqual({ xp: 1_640, capped: false });
  });

  test("an award of 0 is not a capped award", () => {
    expect(gameXpWithinCap(0, 0, 90_000)).toEqual({ xp: 0, capped: false });
  });
});

describe("loadGameXpConfig", () => {
  function reader(values: Record<string, string>) {
    const raw = (key: string) => values[key];
    return {
      getBool: async (key: string, fallback: boolean) =>
        raw(key) === undefined ? fallback : /^(true|1)$/i.test(raw(key)!),
      getInt: async (key: string, fallback: number) =>
        raw(key) === undefined ? fallback : Number.parseInt(raw(key)!, 10),
      getFloat: async (key: string, fallback: number) =>
        raw(key) === undefined ? fallback : Number.parseFloat(raw(key)!),
    };
  }

  test("defaults when nothing is set", async () => {
    expect(await loadGameXpConfig(reader({}))).toEqual({ ...GAME_XP_DEFAULTS });
  });

  test("reads the six games.xp.* settings", async () => {
    const loaded = await loadGameXpConfig(
      reader({
        "games.xp.enabled": "false",
        "games.xp.win_ratio": "0.05",
        "games.xp.draw_ratio": "0.02",
        "games.xp.play_ratio": "0.01",
        "games.xp.min": "40",
        "games.xp.daily_ratio": "0.2",
      }),
    );
    expect(loaded).toEqual({
      enabled: false,
      winRatio: 0.05,
      drawRatio: 0.02,
      playRatio: 0.01,
      min: 40,
      dailyRatio: 0.2,
    });
  });

  test("an invalid or negative value falls back to the default", async () => {
    const loaded = await loadGameXpConfig(
      reader({ "games.xp.win_ratio": "-1", "games.xp.daily_ratio": "abc", "games.xp.min": "-9" }),
    );
    expect(loaded.winRatio).toBe(GAME_XP_DEFAULTS.winRatio);
    expect(loaded.dailyRatio).toBe(GAME_XP_DEFAULTS.dailyRatio);
    expect(loaded.min).toBe(0);
  });
});

describe("result lines", () => {
  const A = "111111111111111111";
  const grant = (patch: Partial<GameXpGrant> = {}): GameXpGrant => ({
    xp: 25,
    capped: false,
    levelUp: false,
    oldLevel: 3,
    newLevel: 3,
    ...patch,
  });

  test("+X XP · +Y Ƶ, in the language of the reader", () => {
    expect(rewardText("fr", { xp: grant(), zeni: 100 })).toBe("**+25 XP** · **+100 Ƶ**");
    expect(rewardText("en", { xp: grant({ xp: 12_345 }), zeni: -50 })).toBe(
      "**+12,345 XP** · **−50 Ƶ**",
    );
  });

  test("a level-up adds Level N -> M in each language", () => {
    const up = grant({ levelUp: true, oldLevel: 3, newLevel: 4 });
    expect(rewardText("fr", { xp: up })).toBe("**+25 XP** · Niveau 3 → 4");
    expect(rewardText("en", { xp: up })).toBe("**+25 XP** · Level 3 → 4");
    expect(rewardText("ja", { xp: up })).toBe("**+25 XP** · レベル 3 → 4");
  });

  test("a swallowed award says the cap is reached instead of a silent zero", () => {
    const capped = grant({ xp: 0, capped: true });
    expect(rewardText("fr", { xp: capped })).toContain("Plafond");
    expect(rewardText("en", { xp: capped })).toContain("cap");
    expect(rewardText("fr", { xp: grant({ xp: 0 }) })).toBe("");
    expect(rewardText("fr", {})).toBe("");
  });

  test("playerRewardLine is empty when there is nothing to show", () => {
    expect(playerRewardLine("fr", A, undefined)).toBe("");
    expect(playerRewardLine("fr", A, grant())).toBe(`<@${A}> **+25 XP**`);
    expect(playerRewardLine("fr", A, grant({ xp: 0 }), -50)).toBe(`<@${A}> **−50 Ƶ**`);
  });

  test("grantLine shows the XP with the zeni, or alone when the zeni are blocked", () => {
    expect(grantLine({ paid: 100, blocked: null, xp: grant() }, A)).toBe(
      `<@${A}> **+25 XP** · **+100 Ƶ**`,
    );
    const blocked = grantLine({ paid: 0, blocked: "daily-cap", xp: grant() }, A);
    expect(blocked).toContain("plafond quotidien");
    expect(blocked).toContain("**+25 XP**");
    // Without XP the former lines are unchanged.
    expect(grantLine({ paid: 0, blocked: null }, A)).toBe("Aucun gain.");
    expect(grantLine({ paid: 0, blocked: "pair-cap" }, A)).not.toContain("XP");
  });
});
