// SPDX-License-Identifier: Apache-2.0
/**
 * Bounded rewards of the Quiz Budokai (docs/products/bot-discord-refonte.md, G1 and G8).
 *
 * The rules are deliberately small and closed:
 *  - zeni only. There is no XP field anywhere in this module or in the receipt, and no multiplier
 *    (neither a role's, nor a race's): the 2026-10-22 incident (docs/operations/bot-economie-incidents.md)
 *    came from role multipliers applied to game gains;
 *  - a room round pays the podium only (60, 40, 20 by default), and nothing when fewer than two
 *    eligible players took part, so playing alone or with idle accounts earns nothing;
 *  - a round pays a member at most `perRoundCapZeni`, a day at most `dailyBudgetZeni` across every
 *    game (`games.daily_zeni_budget`);
 *  - the Activity proposes, the bot disposes: these functions compute what the rules allow, the bot
 *    re-checks the receipt against its own policy, adds its account checks (age, level), applies the
 *    daily budget from its own `action_logs` and credits through `GameRewardService`.
 */
import type { RewardReason } from "../protocol";
import { rankTallies, type PlayerTally, type RankedTally } from "./scoring";

/** Reasons the rules themselves can give (the bot adds its own: daily budget, account, kill switch). */
export const RULE_REWARD_REASONS = [
  "podium",
  "tied_podium",
  "off_podium",
  "solo",
  "inactive",
  "no_points",
  "flagged",
] as const satisfies readonly RewardReason[];
export type RuleRewardReason = (typeof RULE_REWARD_REASONS)[number];

export interface RewardPolicy {
  /** Zeni for first, second, third... Non-increasing. */
  readonly podiumZeni: readonly number[];
  /** No member receives more than this from one round. */
  readonly perRoundCapZeni: number;
  /** `games.daily_zeni_budget`: all game gains of a member over 24 hours. */
  readonly dailyBudgetZeni: number;
  /** Fewer eligible players than this and the round pays nothing. */
  readonly minEligiblePlayers: number;
  /** Share of the questions a member must have answered to be eligible. */
  readonly minAnsweredRatio: number;
  /** "Quiz of the day" (solo, played from the bot): 10 per right answer up to 50, +5 per streak day up to 100. */
  readonly dailyQuiz: {
    readonly perCorrectZeni: number;
    readonly maxCorrectZeni: number;
    readonly perStreakDayZeni: number;
    readonly maxStreakZeni: number;
  };
}

export const DEFAULT_REWARD_POLICY: RewardPolicy = Object.freeze({
  podiumZeni: Object.freeze([60, 40, 20]),
  perRoundCapZeni: 60,
  dailyBudgetZeni: 600,
  minEligiblePlayers: 2,
  minAnsweredRatio: 0.5,
  dailyQuiz: Object.freeze({
    perCorrectZeni: 10,
    maxCorrectZeni: 50,
    perStreakDayZeni: 5,
    maxStreakZeni: 100,
  }),
});

/** Ceiling no policy may exceed, whatever the configuration says (a typo cannot mint zeni). */
export const HARD_LIMITS = Object.freeze({
  perRoundCapZeni: 500,
  dailyBudgetZeni: 5_000,
  podiumPlaces: 10,
});

/** Issues of a policy (empty: usable). */
export function validateRewardPolicy(policy: RewardPolicy): string[] {
  const issues: string[] = [];
  const whole = (value: number): boolean => Number.isInteger(value) && value >= 0;
  if (policy.podiumZeni.length === 0 || policy.podiumZeni.length > HARD_LIMITS.podiumPlaces)
    issues.push("podiumZeni must list 1 to 10 places");
  if (!policy.podiumZeni.every(whole)) issues.push("podiumZeni must be whole numbers >= 0");
  for (let i = 1; i < policy.podiumZeni.length; i++)
    if ((policy.podiumZeni[i] as number) > (policy.podiumZeni[i - 1] as number))
      issues.push("podiumZeni must not increase");
  if (!whole(policy.perRoundCapZeni) || policy.perRoundCapZeni > HARD_LIMITS.perRoundCapZeni)
    issues.push(`perRoundCapZeni must be 0..${HARD_LIMITS.perRoundCapZeni}`);
  if (!whole(policy.dailyBudgetZeni) || policy.dailyBudgetZeni > HARD_LIMITS.dailyBudgetZeni)
    issues.push(`dailyBudgetZeni must be 0..${HARD_LIMITS.dailyBudgetZeni}`);
  if (Math.max(0, ...policy.podiumZeni) > policy.perRoundCapZeni)
    issues.push("a podium place exceeds perRoundCapZeni");
  if (!Number.isInteger(policy.minEligiblePlayers) || policy.minEligiblePlayers < 2)
    issues.push("minEligiblePlayers must be at least 2");
  if (!(policy.minAnsweredRatio >= 0 && policy.minAnsweredRatio <= 1))
    issues.push("minAnsweredRatio must be within 0..1");
  const daily = policy.dailyQuiz;
  for (const value of [
    daily.perCorrectZeni,
    daily.maxCorrectZeni,
    daily.perStreakDayZeni,
    daily.maxStreakZeni,
  ])
    if (!whole(value)) issues.push("dailyQuiz amounts must be whole numbers >= 0");
  if (daily.maxCorrectZeni + daily.maxStreakZeni > policy.dailyBudgetZeni)
    issues.push("the daily quiz maximum exceeds dailyBudgetZeni");
  return issues;
}

function assertPolicy(policy: RewardPolicy): void {
  const issues = validateRewardPolicy(policy);
  if (issues.length > 0) throw new RangeError(`invalid reward policy: ${issues.join("; ")}`);
}

/** A member's result in a round, with whether the room flagged their play as suspicious. */
export interface RewardCandidate extends PlayerTally {
  readonly flagged: boolean;
}

export interface RewardLine {
  readonly userId: string;
  /** Rank in the whole ranking (everyone who played, eligible or not). */
  readonly rank: number;
  readonly score: number;
  readonly correct: number;
  readonly answered: number;
  readonly zeni: number;
  readonly reason: RuleRewardReason;
}

/**
 * What a finished room round pays.
 *
 * Eligible players are those who are not flagged, scored points and answered at least
 * `minAnsweredRatio` of the questions. They are ranked among themselves (an idle or flagged account
 * never takes a podium place); fewer than `minEligiblePlayers` of them and nobody is paid. Players
 * tied for a place share the zeni of the places they cover, rounded down (a tie for first of two
 * players splits first and second place: (60 + 40) / 2 = 50 each), so the total never exceeds the
 * podium.
 */
export function computeRoundRewards(
  candidates: readonly RewardCandidate[],
  questionCount: number,
  policy: RewardPolicy = DEFAULT_REWARD_POLICY,
): RewardLine[] {
  assertPolicy(policy);
  const required = Math.ceil(questionCount * policy.minAnsweredRatio);
  const overall = rankTallies(candidates);
  const flagged = new Set(candidates.filter((c) => c.flagged).map((c) => c.userId));
  const ineligibleReason = (tally: PlayerTally): RuleRewardReason | null => {
    if (flagged.has(tally.userId)) return "flagged";
    if (tally.score <= 0) return "no_points";
    if (tally.answered < required) return "inactive";
    return null;
  };
  const eligible = overall.filter((tally) => ineligibleReason(tally) === null);
  const paid = new Map<string, { zeni: number; reason: RuleRewardReason }>();

  if (eligible.length < policy.minEligiblePlayers) {
    for (const tally of eligible) paid.set(tally.userId, { zeni: 0, reason: "solo" });
  } else {
    const places = rankTallies(eligible);
    const at = (position: number): RankedTally => places[position] as RankedTally;
    // Group tied players: positions start..end-1 of the eligible ordering share their places.
    let start = 0;
    while (start < places.length) {
      let end = start + 1;
      while (end < places.length && at(end).rank === at(start).rank) end++;
      const size = end - start;
      let pool = 0;
      for (let position = start; position < end; position++)
        pool += policy.podiumZeni[position] ?? 0;
      const zeni = Math.min(Math.floor(pool / size), policy.perRoundCapZeni);
      const reason: RuleRewardReason =
        zeni === 0 ? "off_podium" : size === 1 ? "podium" : "tied_podium";
      for (let position = start; position < end; position++)
        paid.set(at(position).userId, { zeni, reason });
      start = end;
    }
  }

  return overall.map((tally) => {
    const outcome = paid.get(tally.userId);
    return {
      userId: tally.userId,
      rank: tally.rank,
      score: tally.score,
      correct: tally.correct,
      answered: tally.answered,
      zeni: outcome?.zeni ?? 0,
      reason: outcome?.reason ?? ineligibleReason(tally) ?? "off_podium",
    };
  });
}

export interface BudgetedLine extends RewardLine {
  /** What may actually be paid after the daily budget. */
  readonly granted: number;
  readonly reasonAfterBudget: RewardReason;
}

/**
 * Applies the daily budget (`games.daily_zeni_budget`) to reward lines: a member never receives more
 * than what is left of their 24-hour budget. `grantedToday` is what the member already received from
 * games over the last 24 hours (the bot reads it from `action_logs`, `kind: "game"`).
 */
export function applyDailyBudget(
  lines: readonly RewardLine[],
  grantedToday: (userId: string) => number,
  policy: RewardPolicy = DEFAULT_REWARD_POLICY,
): BudgetedLine[] {
  assertPolicy(policy);
  return lines.map((line) => {
    const left = Math.max(0, policy.dailyBudgetZeni - Math.max(0, grantedToday(line.userId)));
    const granted = Math.min(line.zeni, left);
    return {
      ...line,
      granted,
      reasonAfterBudget: line.zeni > 0 && granted === 0 ? "daily_budget" : line.reason,
    };
  });
}

/**
 * "Quiz of the day" reward: `perCorrectZeni` per right answer (at most `maxCorrectZeni`) plus
 * `perStreakDayZeni` per day of streak (at most `maxStreakZeni`). The streak bonus needs at least
 * one right answer, so opening the quiz and answering nothing earns nothing. 150 zeni at most.
 */
export function computeDailyQuizReward(
  result: { readonly correct: number; readonly streakDays: number },
  policy: RewardPolicy = DEFAULT_REWARD_POLICY,
): number {
  assertPolicy(policy);
  const correct = Math.max(0, Math.floor(result.correct));
  if (correct === 0) return 0;
  const streak = Math.max(0, Math.floor(result.streakDays));
  const { dailyQuiz } = policy;
  return (
    Math.min(dailyQuiz.maxCorrectZeni, correct * dailyQuiz.perCorrectZeni) +
    Math.min(dailyQuiz.maxStreakZeni, streak * dailyQuiz.perStreakDayZeni)
  );
}
