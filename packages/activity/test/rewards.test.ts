// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  applyDailyBudget,
  computeDailyQuizReward,
  computeRoundRewards,
  DEFAULT_REWARD_POLICY,
  HARD_LIMITS,
  validateRewardPolicy,
  type RewardCandidate,
  type RewardPolicy,
} from "../src";

const player = (
  userId: string,
  score: number,
  answered = 8,
  extra: Partial<RewardCandidate> = {},
): RewardCandidate => ({
  userId,
  score,
  correct: score > 0 ? Math.min(answered, Math.ceil(score / 700)) : 0,
  answered,
  correctElapsedMs: 10_000,
  flagged: false,
  ...extra,
});

const byUser = (lines: ReturnType<typeof computeRoundRewards>) =>
  Object.fromEntries(lines.map((line) => [line.userId, line]));

describe("default policy", () => {
  test("is valid and matches the G1 and G8 figures", () => {
    expect(validateRewardPolicy(DEFAULT_REWARD_POLICY)).toEqual([]);
    expect(DEFAULT_REWARD_POLICY.podiumZeni).toEqual([60, 40, 20]);
    expect(DEFAULT_REWARD_POLICY.dailyBudgetZeni).toBe(600);
    expect(DEFAULT_REWARD_POLICY.perRoundCapZeni).toBe(60);
    expect(Object.isFrozen(DEFAULT_REWARD_POLICY)).toBe(true);
  });
});

describe("computeRoundRewards: podium", () => {
  test("pays 60, 40, 20 to the first three and nothing below", () => {
    const lines = byUser(
      computeRoundRewards(
        [
          player("a", 6000),
          player("b", 5000),
          player("c", 4000),
          player("d", 3000),
          player("e", 1000),
        ],
        8,
      ),
    );
    expect(lines.a).toMatchObject({ rank: 1, zeni: 60, reason: "podium" });
    expect(lines.b).toMatchObject({ rank: 2, zeni: 40, reason: "podium" });
    expect(lines.c).toMatchObject({ rank: 3, zeni: 20, reason: "podium" });
    expect(lines.d).toMatchObject({ rank: 4, zeni: 0, reason: "off_podium" });
    expect(lines.e).toMatchObject({ rank: 5, zeni: 0, reason: "off_podium" });
  });

  test("two players: first and second only", () => {
    const lines = byUser(computeRoundRewards([player("a", 3000), player("b", 2000)], 8));
    expect(lines.a?.zeni).toBe(60);
    expect(lines.b?.zeni).toBe(40);
  });

  test("a tie splits the places it covers, rounded down", () => {
    const tiedFirst = byUser(
      computeRoundRewards([player("a", 5000), player("b", 5000), player("c", 1000)], 8),
    );
    expect(tiedFirst.a).toMatchObject({ rank: 1, zeni: 50, reason: "tied_podium" });
    expect(tiedFirst.b).toMatchObject({ rank: 1, zeni: 50, reason: "tied_podium" });
    expect(tiedFirst.c).toMatchObject({ rank: 3, zeni: 20, reason: "podium" });

    const threeWay = byUser(
      computeRoundRewards([player("a", 5000), player("b", 5000), player("c", 5000)], 8),
    );
    for (const id of ["a", "b", "c"]) expect(threeWay[id]?.zeni).toBe(40);

    const tiedThird = byUser(
      computeRoundRewards(
        [player("a", 9000), player("b", 8000), player("c", 4000), player("d", 4000)],
        8,
      ),
    );
    expect(tiedThird.c).toMatchObject({ rank: 3, zeni: 10, reason: "tied_podium" });
    expect(tiedThird.d?.zeni).toBe(10);

    const tiedBeyond = byUser(
      computeRoundRewards(
        [
          player("a", 9000),
          player("b", 8000),
          player("c", 7000),
          player("d", 2000),
          player("e", 2000),
        ],
        8,
      ),
    );
    expect(tiedBeyond.d).toMatchObject({ zeni: 0, reason: "off_podium" });
  });

  test("however the ties fall, the total never exceeds the podium", () => {
    const total = (scores: number[]) =>
      computeRoundRewards(
        scores.map((score, i) => player(`p${i}`, score)),
        8,
      ).reduce((sum, line) => sum + line.zeni, 0);
    const podium = 60 + 40 + 20;
    for (const scores of [
      [5000, 5000, 5000, 5000],
      [5000, 5000, 4000, 4000, 3000],
      [3000, 3000, 3000],
      [900, 800, 700, 600, 500, 400, 300],
      [1000, 1000],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ])
      expect(total(scores)).toBeLessThanOrEqual(podium);
  });

  test("nobody is paid more than the per-round cap, even under a looser podium", () => {
    const loose: RewardPolicy = {
      ...DEFAULT_REWARD_POLICY,
      perRoundCapZeni: 30,
      podiumZeni: [30, 20, 10],
    };
    const lines = computeRoundRewards([player("a", 3000), player("b", 2000)], 8, loose);
    expect(Math.max(...lines.map((l) => l.zeni))).toBe(30);
  });
});

describe("computeRoundRewards: nothing for playing alone, idle or suspect", () => {
  test("a solo player earns nothing", () => {
    const [line] = computeRoundRewards([player("a", 8000)], 8);
    expect(line).toMatchObject({ zeni: 0, reason: "solo" });
  });

  test("idle accounts do not make a second player: the lone active player earns nothing", () => {
    const lines = byUser(
      computeRoundRewards([player("a", 8000), player("b", 0, 0), player("c", 0, 0)], 8),
    );
    expect(lines.a).toMatchObject({ zeni: 0, reason: "solo" });
    expect(lines.b).toMatchObject({ zeni: 0, reason: "no_points" });
  });

  test("a player who answered less than half the questions is not eligible and takes no place", () => {
    const lines = byUser(
      computeRoundRewards([player("a", 9000), player("b", 8000, 3), player("c", 2000)], 8),
    );
    expect(lines.b).toMatchObject({ zeni: 0, reason: "inactive", rank: 2 });
    // c moves up to the second place of the paid podium.
    expect(lines.a?.zeni).toBe(60);
    expect(lines.c?.zeni).toBe(40);
  });

  test("exactly half the questions is enough", () => {
    const lines = byUser(computeRoundRewards([player("a", 9000), player("b", 2000, 4)], 8));
    expect(lines.b?.zeni).toBe(40);
  });

  test("a flagged player earns nothing and does not take a place", () => {
    const lines = byUser(
      computeRoundRewards(
        [player("cheat", 9999, 8, { flagged: true }), player("a", 5000), player("b", 4000)],
        8,
      ),
    );
    expect(lines.cheat).toMatchObject({ rank: 1, zeni: 0, reason: "flagged" });
    expect(lines.a).toMatchObject({ zeni: 60 });
    expect(lines.b).toMatchObject({ zeni: 40 });
  });

  test("a score of zero never earns, even as the best of a weak room", () => {
    const lines = byUser(computeRoundRewards([player("a", 0), player("b", 0)], 8));
    expect(lines.a?.zeni).toBe(0);
    expect(lines.b?.zeni).toBe(0);
  });

  test("an empty room has no lines", () => {
    expect(computeRoundRewards([], 8)).toEqual([]);
  });
});

describe("rewards are zeni only", () => {
  test("a line carries no XP, multiplier or role field", () => {
    const [line] = computeRoundRewards([player("a", 5000), player("b", 4000)], 8);
    expect(Object.keys(line as object).toSorted()).toEqual([
      "answered",
      "correct",
      "rank",
      "reason",
      "score",
      "userId",
      "zeni",
    ]);
  });

  test("the result depends on the play alone: nothing but tallies and the policy is read", () => {
    const candidates = [player("a", 5000), player("b", 4000)];
    expect(computeRoundRewards(candidates, 8)).toEqual(computeRoundRewards(candidates, 8));
    // Extra properties a caller might attach (a role boost, say) change nothing.
    const boosted = candidates.map((c) => ({ ...c, roleMultiplier: 100_000, xp: 1e12 }));
    expect(computeRoundRewards(boosted, 8)).toEqual(computeRoundRewards(candidates, 8));
  });
});

describe("validateRewardPolicy", () => {
  const base = DEFAULT_REWARD_POLICY;
  const issues = (patch: Partial<RewardPolicy>) => validateRewardPolicy({ ...base, ...patch });

  test("refuses policies that could mint zeni by accident", () => {
    expect(issues({ podiumZeni: [] })).not.toEqual([]);
    expect(issues({ podiumZeni: [20, 40, 60] })).toContain("podiumZeni must not increase");
    expect(issues({ podiumZeni: [60, 40, -1] })).not.toEqual([]);
    expect(issues({ podiumZeni: [60.5] })).not.toEqual([]);
    expect(issues({ podiumZeni: [100, 40], perRoundCapZeni: 60 })).toContain(
      "a podium place exceeds perRoundCapZeni",
    );
    expect(issues({ perRoundCapZeni: HARD_LIMITS.perRoundCapZeni + 1 })).not.toEqual([]);
    expect(issues({ dailyBudgetZeni: HARD_LIMITS.dailyBudgetZeni + 1 })).not.toEqual([]);
    expect(issues({ minEligiblePlayers: 1 })).toContain("minEligiblePlayers must be at least 2");
    expect(issues({ minAnsweredRatio: 1.5 })).not.toEqual([]);
    expect(issues({ dailyBudgetZeni: 100 })).toContain(
      "the daily quiz maximum exceeds dailyBudgetZeni",
    );
  });

  test("an invalid policy stops the computation instead of paying", () => {
    const bad: RewardPolicy = { ...base, podiumZeni: [60, 40, 99] };
    expect(() => computeRoundRewards([player("a", 1000), player("b", 900)], 8, bad)).toThrow(
      RangeError,
    );
    expect(() => computeDailyQuizReward({ correct: 5, streakDays: 3 }, bad)).toThrow(RangeError);
    expect(() => applyDailyBudget([], () => 0, bad)).toThrow(RangeError);
  });
});

describe("applyDailyBudget", () => {
  const lines = computeRoundRewards([player("a", 5000), player("b", 4000), player("c", 3000)], 8);

  test("pays in full while the budget lasts", () => {
    const budgeted = applyDailyBudget(lines, () => 0);
    expect(budgeted.map((l) => l.granted)).toEqual([60, 40, 20]);
    expect(budgeted.every((l) => l.reasonAfterBudget === l.reason)).toBe(true);
  });

  test("cuts to what is left of the 24-hour budget", () => {
    const used: Record<string, number> = { a: 570, b: 599, c: 600 };
    const budgeted = Object.fromEntries(
      applyDailyBudget(lines, (id) => used[id] ?? 0).map((l) => [l.userId, l]),
    );
    expect(budgeted.a).toMatchObject({ granted: 30, reasonAfterBudget: "podium" });
    expect(budgeted.b).toMatchObject({ granted: 1, reasonAfterBudget: "podium" });
    expect(budgeted.c).toMatchObject({ granted: 0, reasonAfterBudget: "daily_budget" });
  });

  test("a member over budget gets nothing, never a negative amount", () => {
    const [first] = applyDailyBudget(lines, () => 5_000);
    expect(first?.granted).toBe(0);
    const [again] = applyDailyBudget(lines, () => -50);
    expect(again?.granted).toBe(60);
  });

  test("a member who earned nothing keeps their own reason", () => {
    const solo = computeRoundRewards([player("a", 5000)], 8);
    const [line] = applyDailyBudget(solo, () => 10_000);
    expect(line).toMatchObject({ granted: 0, reasonAfterBudget: "solo" });
  });

  test("the budget is 600 a day: ten first places in a row exhaust it", () => {
    let used = 0;
    let paid = 0;
    for (let round = 0; round < 15; round++) {
      const [line] = applyDailyBudget(
        [{ userId: "a", rank: 1, score: 1, correct: 1, answered: 8, zeni: 60, reason: "podium" }],
        () => used,
      );
      used += line?.granted ?? 0;
      paid += line?.granted ?? 0;
    }
    expect(paid).toBe(600);
  });
});

describe("computeDailyQuizReward", () => {
  test("10 per right answer up to 50, plus 5 per streak day up to 100", () => {
    expect(computeDailyQuizReward({ correct: 1, streakDays: 0 })).toBe(10);
    expect(computeDailyQuizReward({ correct: 3, streakDays: 0 })).toBe(30);
    expect(computeDailyQuizReward({ correct: 5, streakDays: 0 })).toBe(50);
    expect(computeDailyQuizReward({ correct: 5, streakDays: 4 })).toBe(70);
    expect(computeDailyQuizReward({ correct: 5, streakDays: 20 })).toBe(150);
  });

  test("never exceeds 150, and is capped whatever the inputs", () => {
    expect(computeDailyQuizReward({ correct: 500, streakDays: 10_000 })).toBe(150);
    expect(
      computeDailyQuizReward({
        correct: Number.MAX_SAFE_INTEGER,
        streakDays: Number.MAX_SAFE_INTEGER,
      }),
    ).toBe(150);
  });

  test("the streak alone earns nothing, bad inputs earn nothing", () => {
    expect(computeDailyQuizReward({ correct: 0, streakDays: 50 })).toBe(0);
    expect(computeDailyQuizReward({ correct: -3, streakDays: 5 })).toBe(0);
    expect(computeDailyQuizReward({ correct: 2.9, streakDays: -4 })).toBe(20);
  });

  test("fits the daily budget", () => {
    expect(computeDailyQuizReward({ correct: 5, streakDays: 99 })).toBeLessThanOrEqual(
      DEFAULT_REWARD_POLICY.dailyBudgetZeni,
    );
  });
});
