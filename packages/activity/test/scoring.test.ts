// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { rankTallies, SCORING, scoreAnswer, type PlayerTally } from "../src";

const tally = (userId: string, score: number, correct = 0, correctElapsedMs = 0): PlayerTally => ({
  userId,
  score,
  correct,
  answered: correct,
  correctElapsedMs,
});

describe("scoreAnswer", () => {
  const limitMs = 15_000;

  test("a wrong answer is worth nothing, however fast", () => {
    expect(scoreAnswer({ correct: false, elapsedMs: 800, limitMs })).toBe(0);
  });

  test("a right answer decreases linearly from 1000 to 500", () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 0, limitMs })).toBe(SCORING.maxPoints);
    expect(scoreAnswer({ correct: true, elapsedMs: limitMs, limitMs })).toBe(
      SCORING.minCorrectPoints,
    );
    expect(scoreAnswer({ correct: true, elapsedMs: limitMs / 2, limitMs })).toBe(750);
    expect(scoreAnswer({ correct: true, elapsedMs: 800, limitMs })).toBe(973);
  });

  test("faster is never worth less, over the whole window", () => {
    let previous = Infinity;
    for (let elapsedMs = 0; elapsedMs <= limitMs; elapsedMs += 100) {
      const points = scoreAnswer({ correct: true, elapsedMs, limitMs });
      expect(points).toBeLessThanOrEqual(previous);
      expect(points).toBeGreaterThanOrEqual(500);
      expect(points).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(points)).toBe(true);
      previous = points;
    }
  });

  test("an out-of-window time is clamped, never amplified", () => {
    expect(scoreAnswer({ correct: true, elapsedMs: -5_000, limitMs })).toBe(1000);
    expect(scoreAnswer({ correct: true, elapsedMs: 99_000, limitMs })).toBe(500);
  });

  test("a non-positive limit is a programming error", () => {
    expect(() => scoreAnswer({ correct: true, elapsedMs: 1, limitMs: 0 })).toThrow(RangeError);
    expect(() => scoreAnswer({ correct: true, elapsedMs: 1, limitMs: Number.NaN })).toThrow(
      RangeError,
    );
  });
});

describe("rankTallies", () => {
  test("orders by score, then right answers, then total time of the right answers", () => {
    const ranked = rankTallies([
      tally("c", 2000, 2, 9000),
      tally("a", 3000, 4, 20000),
      tally("b", 2000, 3, 30000),
      tally("d", 2000, 2, 7000),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["a", "b", "d", "c"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  test("players equal on every criterion share a rank (1, 1, 3)", () => {
    const ranked = rankTallies([
      tally("z", 1000, 1, 5000),
      tally("b", 2000, 2, 8000),
      tally("a", 2000, 2, 8000),
      tally("y", 500, 1, 14000),
    ]);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["z", 3],
      ["y", 4],
    ]);
  });

  test("all equal: everybody is first; empty list: empty ranking", () => {
    expect(rankTallies([tally("a", 0), tally("b", 0), tally("c", 0)]).map((r) => r.rank)).toEqual([
      1, 1, 1,
    ]);
    expect(rankTallies([])).toEqual([]);
  });

  test("the order of the input does not matter", () => {
    const players = [
      tally("a", 10, 1, 1),
      tally("b", 10, 1, 1),
      tally("c", 20, 2, 2),
      tally("d", 5),
    ];
    const forward = rankTallies(players);
    const backward = rankTallies(players.toReversed());
    expect(backward).toEqual(forward);
  });

  test("does not mutate its input", () => {
    const players = [tally("b", 1), tally("a", 2)];
    rankTallies(players);
    expect(players.map((p) => p.userId)).toEqual(["b", "a"]);
  });
});
