// SPDX-License-Identifier: Apache-2.0
/**
 * Scoring of the Quiz Budokai: exactness and speed, measured with the server clock only.
 *
 * A right answer is worth `maxPoints` when it is instantaneous and decreases linearly to
 * `minCorrectPoints` at the deadline (the Kahoot curve: 1000 down to 500). A wrong answer or no
 * answer is worth 0. Points are integers, so scores never drift.
 */
export const SCORING = {
  maxPoints: 1000,
  minCorrectPoints: 500,
} as const;

export interface ScoreInput {
  readonly correct: boolean;
  /** Time between the question being sent and the answer being received, by the server clock. */
  readonly elapsedMs: number;
  /** Time allowed for the question. */
  readonly limitMs: number;
}

export function scoreAnswer({ correct, elapsedMs, limitMs }: ScoreInput): number {
  if (!correct) return 0;
  if (!(limitMs > 0)) throw new RangeError("limitMs must be positive");
  const ratio = Math.min(1, Math.max(0, elapsedMs / limitMs));
  return Math.round(SCORING.maxPoints - (SCORING.maxPoints - SCORING.minCorrectPoints) * ratio);
}

/** What a player has done so far in a round. */
export interface PlayerTally {
  readonly userId: string;
  readonly score: number;
  readonly correct: number;
  readonly answered: number;
  /** Sum of the answer times of the right answers (the final tie-break: faster wins). */
  readonly correctElapsedMs: number;
}

export interface RankedTally extends PlayerTally {
  /** Competition ranking: players equal on every criterion share a rank (1, 1, 3). */
  readonly rank: number;
}

function compare(a: PlayerTally, b: PlayerTally): number {
  return b.score - a.score || b.correct - a.correct || a.correctElapsedMs - b.correctElapsedMs;
}

/**
 * Orders players by score, then right answers, then total time of the right answers (less is
 * better). Players equal on all three share a rank and are listed by user id, which only makes the
 * order stable: it never favours anyone.
 */
export function rankTallies(tallies: readonly PlayerTally[]): RankedTally[] {
  const ordered = tallies.toSorted((a, b) => compare(a, b) || a.userId.localeCompare(b.userId));
  const ranked: RankedTally[] = [];
  let rank = 1;
  ordered.forEach((tally, index) => {
    const previous = ordered[index - 1];
    if (previous !== undefined && compare(previous, tally) !== 0) rank = index + 1;
    ranked.push({ ...tally, rank });
  });
  return ranked;
}
