// SPDX-License-Identifier: Apache-2.0
/**
 * One round (manche) of the Quiz Budokai: a fixed list of questions asked one after the other.
 *
 * The session is a pure state machine. It owns no timer and no clock: every method receives `now`
 * from the caller (the room, which reads its injected clock) and `tick(now)` plays the next
 * transition once its deadline has passed. The server decides everything: when a question starts,
 * whether an answer is in time, how many points it is worth. The client only ever sends a choice.
 *
 *   question --(deadline, or every expected player answered)--> reveal --(revealMs)--> question ...
 *   ... --> finished
 */
import type { ErrorCode, PublicQuestion, RankingEntry, Reveal } from "../protocol";
import type { RewardCandidate } from "./rewards";
import { rankTallies, scoreAnswer, type PlayerTally } from "./scoring";
import type { PresentedQuestion } from "./types";

export interface QuizSessionLimits {
  /** Time allowed per question (15 s). */
  readonly questionTimeMs: number;
  /** Pause showing the right answer before the next question. */
  readonly revealMs: number;
  /** Answers received sooner than this after the question was sent are implausible (800 ms). */
  readonly minAnswerMs: number;
  /** Implausibly fast answers tolerated before the player is flagged and earns nothing. */
  readonly maxTooFastStrikes: number;
  /** Consecutive missed questions after which a connected player is "away" and no longer awaited. */
  readonly awayAfterMisses: number;
}

export const DEFAULT_SESSION_LIMITS: QuizSessionLimits = Object.freeze({
  questionTimeMs: 15_000,
  revealMs: 4_000,
  minAnswerMs: 800,
  maxTooFastStrikes: 3,
  awayAfterMisses: 3,
});

export type SubmitError = Extract<
  ErrorCode,
  | "not_player"
  | "wrong_round"
  | "wrong_question"
  | "question_closed"
  | "already_answered"
  | "too_fast"
>;

export type SessionEvent =
  | { readonly type: "question"; readonly question: PublicQuestion }
  | {
      readonly type: "progress";
      readonly roundId: string;
      readonly index: number;
      readonly answered: readonly string[];
      readonly expected: number;
    }
  | { readonly type: "reveal"; readonly reveal: Reveal }
  | { readonly type: "finished"; readonly ranking: readonly RankingEntry[] };

export type SubmitResult =
  | { readonly ok: true; readonly choice: number; readonly events: SessionEvent[] }
  | { readonly ok: false; readonly code: SubmitError };

export interface SessionParticipant {
  readonly userId: string;
  readonly connected: boolean;
}

export interface QuizSessionInit {
  readonly roundId: string;
  readonly questions: readonly PresentedQuestion[];
  readonly participants: readonly SessionParticipant[];
  readonly limits?: QuizSessionLimits;
}

interface Answer {
  readonly choice: number;
  readonly points: number;
}

interface PlayerState {
  connected: boolean;
  score: number;
  correct: number;
  answered: number;
  correctElapsedMs: number;
  /** Consecutive questions missed while connected. */
  misses: number;
  tooFastStrikes: number;
  flagged: boolean;
  answer: Answer | null;
}

type Step = "idle" | "question" | "reveal" | "finished";

export class QuizSession {
  readonly roundId: string;
  readonly limits: QuizSessionLimits;
  readonly #questions: readonly PresentedQuestion[];
  readonly #players = new Map<string, PlayerState>();
  #step: Step = "idle";
  #index = -1;
  #startedAt = 0;
  #revealEndsAt = 0;
  #reveal: Reveal | null = null;

  constructor(init: QuizSessionInit) {
    if (init.questions.length === 0) throw new RangeError("a round needs at least one question");
    this.roundId = init.roundId;
    this.limits = init.limits ?? DEFAULT_SESSION_LIMITS;
    this.#questions = init.questions;
    for (const participant of init.participants) {
      this.#players.set(participant.userId, {
        connected: participant.connected,
        score: 0,
        correct: 0,
        answered: 0,
        correctElapsedMs: 0,
        misses: 0,
        tooFastStrikes: 0,
        flagged: false,
        answer: null,
      });
    }
  }

  get step(): Step {
    return this.#step;
  }

  get total(): number {
    return this.#questions.length;
  }

  /** Index of the current question (-1 before `start`). */
  get index(): number {
    return this.#index;
  }

  get finished(): boolean {
    return this.#step === "finished";
  }

  /** Ids of the questions of this round, in the order they are asked. */
  questionIds(): string[] {
    return this.#questions.map((question) => question.id);
  }

  isParticipant(userId: string): boolean {
    return this.#players.has(userId);
  }

  /** Asks the first question. */
  start(now: number): SessionEvent[] {
    if (this.#step !== "idle") throw new Error("the round already started");
    return this.#openQuestion(0, now);
  }

  /** Time at which `tick` has something to do, or `null` when the round is over. */
  nextDeadline(): number | null {
    if (this.#step === "question") return this.#startedAt + this.limits.questionTimeMs;
    if (this.#step === "reveal") return this.#revealEndsAt;
    return null;
  }

  /**
   * Plays the next transition when its deadline has passed: the question closes (reveal), or the
   * pause ends (next question, or the end). One transition per call, and the phase that starts is
   * timed from `now`, not from the deadline: a server that ticks late never shortens what the
   * players get to see or the time they get to answer.
   */
  tick(now: number): SessionEvent[] {
    const deadline = this.nextDeadline();
    if (deadline === null || now < deadline) return [];
    return this.#step === "question"
      ? this.#closeQuestion(now)
      : this.#openQuestion(this.#index + 1, now);
  }

  /**
   * Records one answer. `index` and `roundId` name the question the client believes it is
   * answering; a mismatch is refused so a late answer can never land on the next question.
   */
  submit(
    userId: string,
    target: { readonly roundId: string; readonly index: number },
    choice: number,
    now: number,
  ): SubmitResult {
    if (target.roundId !== this.roundId || this.#step === "finished")
      return { ok: false, code: "wrong_round" };
    const player = this.#players.get(userId);
    if (!player) return { ok: false, code: "not_player" };
    if (target.index !== this.#index) return { ok: false, code: "wrong_question" };
    if (this.#step !== "question" || now >= this.#startedAt + this.limits.questionTimeMs)
      return { ok: false, code: "question_closed" };
    if (player.answer !== null) return { ok: false, code: "already_answered" };

    const elapsedMs = Math.max(0, now - this.#startedAt);
    if (elapsedMs < this.limits.minAnswerMs) {
      // Not consumed: a human who clicked early can answer again, a script that keeps doing it is flagged.
      player.tooFastStrikes += 1;
      if (player.tooFastStrikes >= this.limits.maxTooFastStrikes) player.flagged = true;
      return { ok: false, code: "too_fast" };
    }

    const question = this.#question();
    const correct = choice === question.answerIndex;
    const points = scoreAnswer({ correct, elapsedMs, limitMs: this.limits.questionTimeMs });
    player.answer = { choice, points };
    player.answered += 1;
    player.misses = 0;
    if (correct) {
      player.correct += 1;
      player.score += points;
      player.correctElapsedMs += elapsedMs;
    }

    const events: SessionEvent[] = [this.#progress()];
    if (this.#everyoneAwaitedAnswered()) events.push(...this.#closeQuestion(now));
    return { ok: true, choice, events };
  }

  /** Presence change; may close the question when the only players left to wait for just left. */
  setConnected(userId: string, connected: boolean, now: number): SessionEvent[] {
    const player = this.#players.get(userId);
    if (!player || player.connected === connected) return [];
    player.connected = connected;
    if (this.#step !== "question") return [];
    const events: SessionEvent[] = [this.#progress()];
    if (this.#everyoneAwaitedAnswered()) events.push(...this.#closeQuestion(now));
    return events;
  }

  /** Removes a participant for good (kicked): no ranking, no reward. */
  drop(userId: string, now: number): SessionEvent[] {
    if (!this.#players.delete(userId) || this.#step !== "question") return [];
    const events: SessionEvent[] = [this.#progress()];
    if (this.#everyoneAwaitedAnswered()) events.push(...this.#closeQuestion(now));
    return events;
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  /** The current question as players see it (no answer, no source), or `null` before the start. */
  publicQuestion(): PublicQuestion | null {
    if (this.#index < 0 || this.#index >= this.#questions.length) return null;
    const question = this.#question();
    return {
      roundId: this.roundId,
      index: this.#index,
      total: this.#questions.length,
      category: question.category,
      prompt: question.prompt,
      choices: question.choices.map((choice) => choice.text),
      startedAt: this.#startedAt,
      deadlineAt: this.#startedAt + this.limits.questionTimeMs,
    };
  }

  /** The reveal of the current question while it is on screen. */
  currentReveal(): Reveal | null {
    return this.#step === "reveal" ? this.#reveal : null;
  }

  /** The choice a player recorded for the current question. */
  choiceOf(userId: string): number | null {
    return this.#players.get(userId)?.answer?.choice ?? null;
  }

  answeredIds(): string[] {
    return [...this.#players]
      .filter(([, player]) => player.answer !== null)
      .map(([userId]) => userId);
  }

  scoreOf(userId: string): number {
    return this.#players.get(userId)?.score ?? 0;
  }

  statusOf(userId: string): "online" | "away" | "offline" {
    const player = this.#players.get(userId);
    if (!player || !player.connected) return "offline";
    return this.#isAway(player) ? "away" : "online";
  }

  ranking(): RankingEntry[] {
    return rankTallies(this.#tallies()).map((tally) => ({
      userId: tally.userId,
      rank: tally.rank,
      score: tally.score,
      correct: tally.correct,
      answered: tally.answered,
    }));
  }

  /** Inputs of the reward computation (available at any time, meaningful once finished). */
  rewardCandidates(): RewardCandidate[] {
    return [...this.#players].map(([userId, player]) => ({
      userId,
      score: player.score,
      correct: player.correct,
      answered: player.answered,
      correctElapsedMs: player.correctElapsedMs,
      flagged: player.flagged,
    }));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #question(): PresentedQuestion {
    return this.#questions[this.#index] as PresentedQuestion;
  }

  #isAway(player: PlayerState): boolean {
    return player.misses >= this.limits.awayAfterMisses;
  }

  /** Players the question waits for: connected and not away. */
  #awaited(): PlayerState[] {
    return [...this.#players.values()].filter(
      (player) => player.connected && !this.#isAway(player),
    );
  }

  #everyoneAwaitedAnswered(): boolean {
    const awaited = this.#awaited();
    return awaited.length > 0 && awaited.every((player) => player.answer !== null);
  }

  #progress(): SessionEvent {
    return {
      type: "progress",
      roundId: this.roundId,
      index: this.#index,
      answered: this.answeredIds(),
      expected: this.#awaited().length,
    };
  }

  #tallies(): PlayerTally[] {
    return [...this.#players].map(([userId, player]) => ({
      userId,
      score: player.score,
      correct: player.correct,
      answered: player.answered,
      correctElapsedMs: player.correctElapsedMs,
    }));
  }

  #openQuestion(index: number, now: number): SessionEvent[] {
    if (index >= this.#questions.length) {
      this.#step = "finished";
      this.#reveal = null;
      return [{ type: "finished", ranking: this.ranking() }];
    }
    this.#step = "question";
    this.#index = index;
    this.#startedAt = now;
    this.#reveal = null;
    for (const player of this.#players.values()) player.answer = null;
    return [{ type: "question", question: this.publicQuestion() as PublicQuestion }];
  }

  #closeQuestion(now: number): SessionEvent[] {
    const question = this.#question();
    const answers: Reveal["answers"] = [];
    for (const [userId, player] of this.#players) {
      if (player.answer === null && player.connected) player.misses += 1;
      answers.push({
        userId,
        choice: player.answer?.choice ?? null,
        points: player.answer?.points ?? 0,
      });
    }
    this.#step = "reveal";
    this.#revealEndsAt = now + this.limits.revealMs;
    this.#reveal = {
      roundId: this.roundId,
      index: this.#index,
      correct: question.answerIndex,
      source: question.source,
      answers,
      ranking: this.ranking(),
      nextAt: this.#revealEndsAt,
    };
    return [{ type: "reveal", reveal: this.#reveal }];
  }
}
