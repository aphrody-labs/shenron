// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SESSION_LIMITS,
  presentQuestion,
  QuizSession,
  scoreAnswer,
  seededRng,
  type PresentedQuestion,
  type SessionEvent,
} from "../src";
import { makeBank, U1, U2, U3 } from "./helpers";

const T0 = 1_800_000_000_000;
const { questionTimeMs, revealMs, minAnswerMs } = DEFAULT_SESSION_LIMITS;

function questions(count = 3): PresentedQuestion[] {
  const rng = seededRng("session");
  return makeBank(count)
    .all()
    .slice(0, count)
    .map((q) => presentQuestion(q, rng));
}

function make(count = 3, players = [U1, U2, U3]) {
  const qs = questions(count);
  const session = new QuizSession({
    roundId: "lq3k9d2a-1",
    questions: qs,
    participants: players.map((userId) => ({ userId, connected: true })),
  });
  return { session, qs, target: (index: number) => ({ roundId: "lq3k9d2a-1", index }) };
}

const kinds = (events: SessionEvent[]) => events.map((e) => e.type);
const wrongChoice = (q: PresentedQuestion) => (q.answerIndex + 1) % 4;

describe("QuizSession: a question", () => {
  test("start asks the first question with the server's times, and no answer", () => {
    const { session } = make();
    const events = session.start(T0);
    expect(kinds(events)).toEqual(["question"]);
    const question = (events[0] as Extract<SessionEvent, { type: "question" }>).question;
    expect(question).toMatchObject({
      roundId: "lq3k9d2a-1",
      index: 0,
      total: 3,
      startedAt: T0,
      deadlineAt: T0 + questionTimeMs,
    });
    expect(Object.keys(question).toSorted()).toEqual([
      "category",
      "choices",
      "deadlineAt",
      "index",
      "prompt",
      "roundId",
      "startedAt",
      "total",
    ]);
    expect(session.nextDeadline()).toBe(T0 + questionTimeMs);
    expect(() => session.start(T0)).toThrow();
  });

  test("a right answer scores by speed, a wrong one scores nothing", () => {
    const { session, qs, target } = make();
    session.start(T0);
    const right = session.submit(U1, target(0), qs[0]!.answerIndex, T0 + 3_000);
    const wrong = session.submit(U2, target(0), wrongChoice(qs[0]!), T0 + 1_000);
    expect(right.ok && wrong.ok).toBe(true);
    expect(session.scoreOf(U1)).toBe(
      scoreAnswer({ correct: true, elapsedMs: 3_000, limitMs: questionTimeMs }),
    );
    expect(session.scoreOf(U1)).toBe(900);
    expect(session.scoreOf(U2)).toBe(0);
    expect(session.choiceOf(U1)).toBe(qs[0]!.answerIndex);
    expect(session.answeredIds().toSorted()).toEqual([U1, U2]);
  });

  test("progress is reported at each answer; the reveal comes when the last awaited player answered", () => {
    const { session, qs, target } = make();
    session.start(T0);
    const first = session.submit(U1, target(0), qs[0]!.answerIndex, T0 + 2_000);
    expect(first.ok && kinds(first.events)).toEqual(["progress"]);
    if (first.ok)
      expect(first.events[0]).toMatchObject({ type: "progress", answered: [U1], expected: 3 });
    session.submit(U2, target(0), 0, T0 + 3_000);
    const last = session.submit(U3, target(0), 1, T0 + 4_000);
    expect(last.ok && kinds(last.events)).toEqual(["progress", "reveal"]);
    expect(session.step).toBe("reveal");
    expect(session.nextDeadline()).toBe(T0 + 4_000 + revealMs);
  });

  test("the reveal names the right choice and the source, and lists every answer", () => {
    const { session, qs, target } = make();
    session.start(T0);
    session.submit(U1, target(0), qs[0]!.answerIndex, T0 + 2_000);
    session.submit(U2, target(0), wrongChoice(qs[0]!), T0 + 2_500);
    session.tick(T0 + questionTimeMs);
    const reveal = session.currentReveal()!;
    expect(reveal.correct).toBe(qs[0]!.answerIndex);
    expect(reveal.source).toEqual(qs[0]!.source);
    expect(reveal.nextAt).toBe(T0 + questionTimeMs + revealMs);
    expect(reveal.answers).toHaveLength(3);
    expect(reveal.answers.find((a) => a.userId === U1)).toMatchObject({
      choice: qs[0]!.answerIndex,
      points: 933,
    });
    expect(reveal.answers.find((a) => a.userId === U2)).toMatchObject({ points: 0 });
    expect(reveal.answers.find((a) => a.userId === U3)).toEqual({
      userId: U3,
      choice: null,
      points: 0,
    });
    expect(reveal.ranking[0]).toMatchObject({ userId: U1, rank: 1 });
  });

  test("the deadline closes the question for those who did not answer", () => {
    const { session } = make();
    session.start(T0);
    expect(session.tick(T0 + questionTimeMs - 1)).toEqual([]);
    expect(kinds(session.tick(T0 + questionTimeMs))).toEqual(["reveal"]);
    expect(session.statusOf(U1)).toBe("online");
  });

  test("after the reveal the next question starts when the pause is over, timed from then", () => {
    const { session } = make();
    session.start(T0);
    session.tick(T0 + questionTimeMs);
    const revealEnd = T0 + questionTimeMs + revealMs;
    expect(session.tick(revealEnd - 1)).toEqual([]);
    const next = session.tick(revealEnd);
    expect(kinds(next)).toEqual(["question"]);
    expect(session.publicQuestion()).toMatchObject({
      index: 1,
      startedAt: revealEnd,
      deadlineAt: revealEnd + questionTimeMs,
    });
    // Nobody answered the first question yet answers are cleared for the second.
    expect(session.answeredIds()).toEqual([]);
  });

  test("a late tick plays one transition and times the next phase from now, not from the deadline", () => {
    const { session } = make();
    session.start(T0);
    const late = T0 + questionTimeMs + 7_000;
    expect(kinds(session.tick(late))).toEqual(["reveal"]);
    // The players still get the whole pause after the reveal they actually received.
    expect(session.nextDeadline()).toBe(late + revealMs);
    expect(session.tick(late + revealMs - 1)).toEqual([]);
    expect(kinds(session.tick(late + revealMs + 3_000))).toEqual(["question"]);
    expect(session.publicQuestion()?.startedAt).toBe(late + revealMs + 3_000);
    expect(session.publicQuestion()?.deadlineAt).toBe(late + revealMs + 3_000 + questionTimeMs);
  });

  test("a server that slept through the whole round still plays it out question by question", () => {
    const { session } = make();
    session.start(T0);
    let now = T0;
    const seen: string[] = [];
    for (let i = 0; i < 20 && !session.finished; i++) {
      now += 10 * 60_000;
      seen.push(...kinds(session.tick(now)));
    }
    expect(seen).toEqual(["reveal", "question", "reveal", "question", "reveal", "finished"]);
  });
});

describe("QuizSession: refused answers", () => {
  test("twice, to another question, to another round, by a stranger, after the time", () => {
    const { session, qs, target } = make();
    session.start(T0);
    expect(session.submit(U1, target(0), qs[0]!.answerIndex, T0 + 2_000).ok).toBe(true);
    expect(session.submit(U1, target(0), 0, T0 + 3_000)).toEqual({
      ok: false,
      code: "already_answered",
    });
    expect(session.submit(U2, target(1), 0, T0 + 3_000)).toEqual({
      ok: false,
      code: "wrong_question",
    });
    expect(session.submit(U2, { roundId: "zzzz-9", index: 0 }, 0, T0 + 3_000)).toEqual({
      ok: false,
      code: "wrong_round",
    });
    expect(session.submit("999999999", target(0), 0, T0 + 3_000)).toEqual({
      ok: false,
      code: "not_player",
    });
    // The first answer counts: the score did not move and the second choice was not recorded.
    expect(session.choiceOf(U1)).toBe(qs[0]!.answerIndex);
    expect(session.submit(U2, target(0), 0, T0 + questionTimeMs - 1).ok).toBe(true);
    expect(session.submit(U3, target(0), 0, T0 + questionTimeMs)).toEqual({
      ok: false,
      code: "question_closed",
    });
    expect(session.submit(U3, target(0), 0, T0 + questionTimeMs + 5_000)).toEqual({
      ok: false,
      code: "question_closed",
    });
  });

  test("a late answer cannot land on the next question", () => {
    const { session, qs, target } = make();
    session.start(T0);
    session.tick(T0 + questionTimeMs);
    session.tick(T0 + questionTimeMs + revealMs);
    expect(session.publicQuestion()?.index).toBe(1);
    expect(
      session.submit(U1, target(0), qs[0]!.answerIndex, T0 + questionTimeMs + revealMs + 2_000),
    ).toEqual({
      ok: false,
      code: "wrong_question",
    });
  });

  test("during the pause the question is closed", () => {
    const { session, target } = make();
    session.start(T0);
    session.tick(T0 + questionTimeMs);
    expect(session.submit(U1, target(0), 0, T0 + questionTimeMs + 1_000)).toEqual({
      ok: false,
      code: "question_closed",
    });
  });

  test("before the start, and after the end", () => {
    const { session, target } = make(1);
    expect(session.submit(U1, target(0), 0, T0)).toEqual({ ok: false, code: "wrong_question" });
    session.start(T0);
    session.tick(T0 + questionTimeMs);
    session.tick(T0 + questionTimeMs + revealMs);
    expect(session.finished).toBe(true);
    expect(session.submit(U1, target(0), 0, T0 + 99_999)).toEqual({
      ok: false,
      code: "wrong_round",
    });
    expect(session.nextDeadline()).toBeNull();
    expect(session.tick(T0 + 999_999)).toEqual([]);
  });
});

describe("QuizSession: implausibly fast answers", () => {
  test("under 800 ms is refused, not consumed, and counted", () => {
    const { session, qs, target } = make();
    session.start(T0);
    expect(session.submit(U1, target(0), qs[0]!.answerIndex, T0 + minAnswerMs - 1)).toEqual({
      ok: false,
      code: "too_fast",
    });
    expect(session.choiceOf(U1)).toBeNull();
    // The same answer a moment later is accepted, and scored at its real time.
    const ok = session.submit(U1, target(0), qs[0]!.answerIndex, T0 + minAnswerMs);
    expect(ok.ok).toBe(true);
    expect(session.scoreOf(U1)).toBe(
      scoreAnswer({ correct: true, elapsedMs: minAnswerMs, limitMs: questionTimeMs }),
    );
    expect(session.rewardCandidates().find((c) => c.userId === U1)?.flagged).toBe(false);
  });

  test("three strikes flag the player for the rest of the round", () => {
    const { session, qs, target } = make();
    session.start(T0);
    for (let i = 0; i < 3; i++) session.submit(U1, target(0), 0, T0 + 100 + i);
    expect(session.rewardCandidates().find((c) => c.userId === U1)?.flagged).toBe(true);
    expect(session.rewardCandidates().find((c) => c.userId === U2)?.flagged).toBe(false);
    // Flagged players may still play (their ranking is real) but their rewards are forfeited.
    expect(session.submit(U1, target(0), qs[0]!.answerIndex, T0 + 5_000).ok).toBe(true);
  });
});

describe("QuizSession: presence", () => {
  test("a disconnected player is not waited for; their score is kept", () => {
    const { session, qs, target } = make();
    session.start(T0);
    session.submit(U1, target(0), qs[0]!.answerIndex, T0 + 2_000);
    session.submit(U2, target(0), qs[0]!.answerIndex, T0 + 3_000);
    const events = session.setConnected(U3, false, T0 + 4_000);
    expect(kinds(events)).toEqual(["progress", "reveal"]);
    expect(session.statusOf(U3)).toBe("offline");
    expect(session.setConnected(U3, false, T0 + 4_100)).toEqual([]);
    session.tick(T0 + 4_000 + revealMs);
    expect(session.scoreOf(U1)).toBeGreaterThan(0);
  });

  test("a returning player answers if the time has not run out", () => {
    const { session, qs, target } = make();
    session.start(T0);
    session.setConnected(U3, false, T0 + 1_000);
    session.setConnected(U3, true, T0 + 5_000);
    expect(session.submit(U3, target(0), qs[0]!.answerIndex, T0 + 6_000).ok).toBe(true);
  });

  test("when everyone is offline nothing closes early: the deadline does", () => {
    const { session } = make(3, [U1]);
    session.start(T0);
    expect(session.setConnected(U1, false, T0 + 1_000)).toEqual([
      expect.objectContaining({ type: "progress" }),
    ]);
    expect(session.step).toBe("question");
    expect(kinds(session.tick(T0 + questionTimeMs))).toEqual(["reveal"]);
  });

  test("three missed questions in a row make a connected player away, and they are no longer awaited", () => {
    const { session, qs, target } = make(5);
    session.start(T0);
    let now = T0;
    for (let q = 0; q < 3; q++) {
      session.submit(U1, target(q), qs[q]!.answerIndex, now + 2_000);
      session.submit(U2, target(q), qs[q]!.answerIndex, now + 2_500);
      // U3 sleeps: the question runs to its deadline each time.
      now += questionTimeMs;
      session.tick(now);
      now += revealMs;
      session.tick(now);
    }
    expect(session.statusOf(U3)).toBe("away");
    // Question 4: the two active players answering is enough to reveal at once.
    session.submit(U1, target(3), qs[3]!.answerIndex, now + 2_000);
    const result = session.submit(U2, target(3), qs[3]!.answerIndex, now + 2_500);
    expect(result.ok && kinds(result.events)).toEqual(["progress", "reveal"]);
    // An away player who answers is back.
    session.tick(now + 2_500 + revealMs);
    const back = session.submit(U3, target(4), qs[4]!.answerIndex, now + 2_500 + revealMs + 3_000);
    expect(back.ok).toBe(true);
    expect(session.statusOf(U3)).toBe("online");
  });

  test("dropping a participant removes them from ranking and rewards, and may close the question", () => {
    const { session, qs, target } = make();
    session.start(T0);
    session.submit(U1, target(0), qs[0]!.answerIndex, T0 + 2_000);
    session.submit(U2, target(0), qs[0]!.answerIndex, T0 + 2_500);
    const events = session.drop(U3, T0 + 3_000);
    expect(kinds(events)).toEqual(["progress", "reveal"]);
    expect(session.isParticipant(U3)).toBe(false);
    expect(session.ranking().map((r) => r.userId)).not.toContain(U3);
    expect(session.rewardCandidates().map((c) => c.userId)).not.toContain(U3);
    expect(session.drop(U3, T0 + 3_100)).toEqual([]);
  });
});

describe("QuizSession: the whole round", () => {
  test("plays to the end, finishes with the final ranking, and the scores add up", () => {
    const { session, qs, target } = make(3);
    session.start(T0);
    let now = T0;
    const expected = new Map<string, number>([
      [U1, 0],
      [U2, 0],
      [U3, 0],
    ]);
    for (let q = 0; q < 3; q++) {
      // U1 always right in 2 s, U2 right in 6 s on even questions, U3 always wrong.
      session.submit(U1, target(q), qs[q]!.answerIndex, now + 2_000);
      expected.set(
        U1,
        expected.get(U1)! +
          scoreAnswer({ correct: true, elapsedMs: 2_000, limitMs: questionTimeMs }),
      );
      if (q % 2 === 0) {
        session.submit(U2, target(q), qs[q]!.answerIndex, now + 6_000);
        expected.set(
          U2,
          expected.get(U2)! +
            scoreAnswer({ correct: true, elapsedMs: 6_000, limitMs: questionTimeMs }),
        );
      } else session.submit(U2, target(q), wrongChoice(qs[q]!), now + 6_000);
      const last = session.submit(U3, target(q), wrongChoice(qs[q]!), now + 7_000);
      expect(last.ok && kinds(last.events)).toContain("reveal");
      now += 7_000 + revealMs;
      const events = session.tick(now);
      expect(kinds(events)).toEqual(q < 2 ? ["question"] : ["finished"]);
    }
    expect(session.finished).toBe(true);
    for (const [userId, score] of expected) expect(session.scoreOf(userId)).toBe(score);
    const ranking = session.ranking();
    expect(ranking.map((r) => [r.userId, r.rank])).toEqual([
      [U1, 1],
      [U2, 2],
      [U3, 3],
    ]);
    expect(ranking[0]).toMatchObject({ correct: 3, answered: 3 });
    expect(ranking[2]).toMatchObject({ score: 0, correct: 0, answered: 3 });
    expect(session.questionIds()).toEqual(qs.map((q) => q.id));
  });

  test("a round needs at least one question", () => {
    expect(() => new QuizSession({ roundId: "a-1", questions: [], participants: [] })).toThrow(
      RangeError,
    );
  });
});
