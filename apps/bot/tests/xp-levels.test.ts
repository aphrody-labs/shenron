/**
 * XP <-> level formula: pure functions that also serve to fix data (level recomputed from
 * the XP, stored levels that drifted, buckets of the distribution).
 */
import { describe, expect, test } from "bun:test";
import {
  XP_MAX,
  buildXpBuckets,
  levelDrift,
  levelFromXp,
  sanitizeXp,
  type LevelThreshold,
} from "~/lib/xp";

// Production curve: 2 XP for level 1, then thresholds that multiply.
const CURVE: LevelThreshold[] = [
  { level: 1, xp: 2 },
  { level: 2, xp: 10 },
  { level: 3, xp: 100 },
  { level: 4, xp: 180 },
  { level: 12, xp: 3_000_000 },
  { level: 13, xp: 6_000_000 },
];

describe("levelFromXp", () => {
  test("niveau 0 avant le premier palier, palier atteint inclus", () => {
    expect(levelFromXp(0, CURVE)).toBe(0);
    expect(levelFromXp(1, CURVE)).toBe(0);
    expect(levelFromXp(2, CURVE)).toBe(1);
    expect(levelFromXp(99, CURVE)).toBe(2);
    expect(levelFromXp(100, CURVE)).toBe(3);
  });

  test("monotone : plus d'XP ne fait jamais baisser le niveau", () => {
    let last = 0;
    for (let xp = 0; xp < 7_000_000; xp += xp < 1_000 ? 1 : 10_007) {
      const level = levelFromXp(xp, CURVE);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
    expect(last).toBe(13);
  });

  test("tolère une courbe non triée et des XP non finies ou négatives", () => {
    const shuffled = CURVE.toReversed();
    expect(levelFromXp(150, shuffled)).toBe(3);
    expect(levelFromXp(Number.NaN, CURVE)).toBe(0);
    expect(levelFromXp(-50, CURVE)).toBe(0);
    expect(levelFromXp(Number.POSITIVE_INFINITY, CURVE)).toBe(0);
    expect(levelFromXp(XP_MAX, CURVE)).toBe(13);
  });

  test("courbe vide : niveau 0", () => {
    expect(levelFromXp(1e9, [])).toBe(0);
  });
});

describe("levelDrift", () => {
  test("ne liste que les niveaux stockés qui ne correspondent plus à l'XP", () => {
    const drift = levelDrift(
      [
        { id: "ok", xp: 100, lastLevelReached: 3 },
        { id: "stale-high", xp: 5, lastLevelReached: 12 },
        { id: "stale-low", xp: 3_000_000, lastLevelReached: 4 },
        { id: "zero", xp: 0, lastLevelReached: 0 },
      ],
      CURVE,
    );
    expect(drift).toEqual([
      { id: "stale-high", xp: 5, stored: 12, expected: 1 },
      { id: "stale-low", xp: 3_000_000, stored: 4, expected: 12 },
    ]);
  });
});

describe("sanitizeXp", () => {
  test("entier sûr dans [0, XP_MAX]", () => {
    expect(sanitizeXp(12.9)).toBe(12);
    expect(sanitizeXp(-5)).toBe(0);
    expect(sanitizeXp(Number.NaN)).toBe(0);
    expect(sanitizeXp(1e300)).toBe(XP_MAX);
    expect(sanitizeXp(Number.POSITIVE_INFINITY)).toBe(XP_MAX);
    expect(sanitizeXp(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("buildXpBuckets", () => {
  test("tranches par niveau atteint, contiguës, la dernière ouverte", () => {
    const buckets = buildXpBuckets(CURVE);
    expect(buckets[0]).toEqual({ level: 0, minXp: 0, maxXp: 2 });
    expect(buckets[1]).toEqual({ level: 1, minXp: 2, maxXp: 10 });
    expect(buckets.at(-1)).toEqual({ level: 13, minXp: 6_000_000, maxXp: XP_MAX });
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]!.minXp).toBe(buckets[i - 1]!.maxXp);
    }
    // Un membre à l'XP d'une tranche a bien le niveau de cette tranche.
    for (const b of buckets) expect(levelFromXp(b.minXp, CURVE)).toBe(b.level);
  });
});
