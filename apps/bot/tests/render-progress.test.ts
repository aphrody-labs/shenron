import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { getLevelThresholds, xpProgress } from "~/lib/xp";
import { sampleProgress } from "~/render/fixtures";
import { legacyProgressLabel } from "~/services/CardService";

/** Intl uses narrow no-break spaces in French numbers: compare with plain spaces. */
const plain = (text: string | null): string => (text ?? "").replace(/[  ]/g, " ");

describe("level, gauge and next-level line agree", () => {
  test("on the active curve, the next level is the level + 1", () => {
    const curve = getLevelThresholds().toSorted((a, b) => a.xp - b.xp);
    expect(curve.length).toBeGreaterThan(3);
    // below the first threshold, then at and just below every threshold
    const probes = [0, ...curve.flatMap((t) => [t.xp - 1, t.xp, t.xp + 1]).filter((xp) => xp >= 0)];
    for (const xp of probes) {
      const { level, next } = xpProgress(xp);
      if (next) expect(next.level, `xp ${xp}`).toBe(level + 1);
    }
    expect(xpProgress(curve.at(-1)!.xp).next).toBeUndefined();
  });

  test("the sample line is derived from xpProgress, not typed by hand", () => {
    const { level, next, remaining } = xpProgress(123_456);
    expect(level).toBe(6);
    expect(next?.level).toBe(7);
    const line = plain(sampleProgress(123_456).fr);
    expect(line).toBe(
      `${plain(remaining.toLocaleString("fr-FR"))} XP avant le niveau ${level + 1}`,
    );
    expect(line).toBe("126 544 XP avant le niveau 7");
    expect(sampleProgress(123_456).ja).toContain("レベル7");
  });

  test("the French fallback of CardService follows the same numbers", () => {
    expect(plain(legacyProgressLabel(123_456))).toBe(plain(sampleProgress(123_456).fr));
    expect(plain(legacyProgressLabel(0))).toBe("1 000 XP avant le niveau 1");
    expect(plain(legacyProgressLabel(99_999))).toBe("1 XP avant le niveau 6");
    expect(legacyProgressLabel(Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(legacyProgressLabel(Number.NaN)).toBe(legacyProgressLabel(0));
  });
});
