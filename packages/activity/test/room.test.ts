// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ROOM_LIMITS,
  Room,
  seededRng,
  verifyReceipt,
  signReceipt,
  type RoomLimits,
  type SettlementReceipt,
} from "../src";
import { ManualClock } from "../src/testing";
import { correctChoice, Hub, makeBank, msg, user, U1, U2, U3, U4 } from "./helpers";

const SECRET = "room-test-secret-with-enough-bytes";

function setup(limits: Partial<RoomLimits> = {}, bankSize = 20) {
  const clock = new ManualClock();
  const settlements: SettlementReceipt[] = [];
  const room = new Room({
    instanceId: "i-1234-gc-5678-9012",
    clock,
    rng: seededRng("room"),
    bank: makeBank(bankSize),
    limits,
    onSettlement: (receipt) => settlements.push(receipt),
  });
  const hub = new Hub(room);
  return { clock, room, hub, settlements };
}
type Setup = ReturnType<typeof setup>;

const QUESTION_MS = DEFAULT_ROOM_LIMITS.session.questionTimeMs;
const REVEAL_MS = DEFAULT_ROOM_LIMITS.session.revealMs;

/** Everyone who joins is seated in the lobby: U1 is the host. */
function lobby(count = 3, limits: Partial<RoomLimits> = {}): Setup {
  const s = setup(limits);
  for (let i = 1; i <= count; i++) s.hub.join(user(i));
  s.hub.clear();
  return s;
}

function currentQuestion(s: Setup) {
  const round = s.room.snapshotFor(U1).round;
  if (!round) throw new Error("no running question");
  return round.question;
}

type Plan = Record<string, "right" | "wrong" | "skip">;

/**
 * Plays one question: each user answers at its own delay (2 s, 3 s... after the question), then the
 * question ends (by the last answer or by the deadline) and the pause runs out.
 */
function playQuestion(s: Setup, plan: Plan) {
  const question = currentQuestion(s);
  const right = correctChoice(question);
  let delay = 1_500;
  for (const [userId, action] of Object.entries(plan)) {
    delay += 500;
    if (action === "skip") continue;
    s.clock.set(question.startedAt + delay);
    s.hub.send(
      userId,
      msg.answer(question.roundId, question.index, action === "right" ? right : (right + 1) % 4),
    );
  }
  if (s.room.snapshotFor(U1).round?.step === "question") {
    s.clock.set(question.startedAt + QUESTION_MS);
    s.hub.tick();
  }
  s.clock.advance(REVEAL_MS);
  s.hub.tick();
}

function playRound(s: Setup, plan: (index: number) => Plan, count = 5) {
  s.hub.send(U1, msg.configure({ questionCount: count }));
  s.hub.send(U1, msg.start());
  for (let i = 0; i < count; i++) playQuestion(s, plan(i));
}

describe("joining", () => {
  test("the first member takes a seat and the lead; their welcome describes the lobby", () => {
    const { hub, room } = setup();
    const result = hub.join(U1, "Goku");
    expect(result).toMatchObject({ admitted: true, role: "player" });
    expect(room.hostId).toBe(U1);
    const welcome = hub.last(U1, "welcome");
    expect(welcome.you).toEqual({ userId: U1, role: "player" });
    expect(welcome.room).toMatchObject({
      instanceId: "i-1234-gc-5678-9012",
      phase: "lobby",
      hostId: U1,
      maxPlayers: 25,
      config: { questionCount: 8, categories: ["characters", "techniques", "sagas"] },
      availableCategories: ["characters", "techniques", "sagas"],
      round: null,
      ranking: [],
      settled: null,
    });
    expect(welcome.room.players).toEqual([
      {
        userId: U1,
        name: "Goku",
        avatar: null,
        role: "player",
        status: "online",
        score: 0,
        answered: false,
      },
    ]);
  });

  test("the others are told when someone arrives; the newcomer gets a welcome, not a roster", () => {
    const { hub } = setup();
    hub.join(U1);
    hub.clear();
    hub.join(U2);
    expect(hub.messages(U1, "roster")).toHaveLength(1);
    expect(hub.last(U1, "roster").players.map((p) => p.userId)).toEqual([U1, U2]);
    expect(hub.messages(U2, "roster")).toHaveLength(0);
    expect(hub.last(U2, "welcome").room.players).toHaveLength(2);
    expect(hub.last(U2, "welcome").room.hostId).toBe(U1);
  });

  test("names are cleaned and avatars checked", () => {
    const { room } = setup();
    const hostile = [
      "  Go",
      String.fromCodePoint(0),
      "ku",
      String.fromCodePoint(0x202e),
      "\n  ",
    ].join("");
    room.join({ userId: U1, name: hostile, avatar: "a_1f2e3d" });
    room.join({ userId: U2, name: "x".repeat(200), avatar: "../evil" });
    room.join({ userId: U3, name: String.fromCodePoint(7, 0), avatar: null });
    const players = room.snapshotFor(U1).players;
    expect(players[0]).toMatchObject({ name: "Goku", avatar: "a_1f2e3d" });
    expect(players[1]?.name).toHaveLength(64);
    expect(players[1]?.avatar).toBeNull();
    expect(players[2]?.name).toBe("?");
  });

  test("25 seats; the next arrivals watch and are told the room is full", () => {
    const { hub, room } = setup();
    for (let i = 1; i <= 25; i++)
      expect(hub.join(user(i)).admitted && room.roleOf(user(i))).toBe("player");
    const late = hub.join(user(26));
    expect(late).toMatchObject({ admitted: true, role: "spectator" });
    expect(hub.errors(user(26))).toEqual(["room_full"]);
    expect(room.snapshotFor(user(26)).players.filter((p) => p.role === "player")).toHaveLength(25);
  });

  test("beyond the spectators' limit the arrival is refused", () => {
    const { hub } = setup({ maxPlayers: 2, maxSpectators: 1 });
    hub.join(U1);
    hub.join(U2);
    expect(hub.join(U3)).toMatchObject({ admitted: true, role: "spectator" });
    const refused = hub.join(U4);
    expect(refused).toMatchObject({ admitted: false, code: "room_full" });
    expect(hub.errors(U4)).toEqual(["room_full"]);
    expect(hub.room.has(U4)).toBe(false);
  });

  test("whoever arrives during a round watches, and sees the question without its answer", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    s.clock.advance(3_000);
    const result = s.hub.join(U3);
    expect(result).toMatchObject({ admitted: true, role: "spectator" });
    const welcome = s.hub.last(U3, "welcome");
    expect(welcome.you.role).toBe("spectator");
    expect(welcome.room.phase).toBe("round");
    expect(welcome.room.round).toMatchObject({ step: "question", yourChoice: null, reveal: null });
    expect(JSON.stringify(welcome)).not.toContain("answerIndex");
    // No error is shown to a spectator who was never promised a seat.
    expect(s.hub.errors(U3)).toEqual([]);
    // A spectator is online, not "offline" for want of being in the round.
    const roster = s.room.snapshotFor(U1).players;
    expect(roster.find((p) => p.userId === U3)).toMatchObject({
      role: "spectator",
      status: "online",
      score: 0,
    });
    expect(roster.map((p) => p.status)).toEqual(["online", "online", "online"]);
  });

  test("a malformed user id is refused before it can poison the roster", () => {
    const { room } = setup();
    for (const userId of ["", "abc", "<@123>", "12", "1".repeat(30)]) {
      const result = room.join({ userId, name: "Nobody" });
      expect(result).toMatchObject({ admitted: false, code: "invalid_message" });
    }
    expect(room.memberCount).toBe(0);
  });

  test("a returning member keeps their role, their score and their answer", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.advance(2_000);
    s.hub.send(U2, msg.answer(question.roundId, 0, correctChoice(question)));
    s.hub.leave(U2);
    expect(s.room.snapshotFor(U1).players.find((p) => p.userId === U2)?.status).toBe("offline");
    s.hub.join(U2);
    const welcome = s.hub.last(U2, "welcome");
    expect(welcome.you.role).toBe("player");
    expect(welcome.room.round?.yourChoice).toBe(correctChoice(question));
    expect(welcome.room.players.find((p) => p.userId === U2)).toMatchObject({
      status: "online",
      answered: true,
    });
  });

  test("a removed member is refused", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.kick(U2));
    expect(s.hub.join(U2)).toMatchObject({ admitted: false, code: "banned" });
  });
});

describe("the host", () => {
  test("passes to the longest-present player when the host leaves", () => {
    const s = lobby(3);
    s.hub.leave(U1);
    expect(s.room.hostId).toBe(U2);
    expect(s.hub.last(U2, "roster").hostId).toBe(U2);
    s.hub.leave(U2);
    expect(s.room.hostId).toBe(U3);
    s.hub.leave(U3);
    expect(s.room.hostId).toBeNull();
  });

  test("only the host configures, starts, kicks and replays", () => {
    const s = lobby(2);
    for (const message of [
      msg.configure({ questionCount: 6 }),
      msg.start(),
      msg.kick(U1),
      msg.playAgain(),
    ]) {
      s.hub.clear();
      s.hub.send(U2, message);
      expect(s.hub.errors(U2)).toEqual(["not_host"]);
    }
    expect(s.room.phase).toBe("lobby");
    expect(s.room.config.questionCount).toBe(8);
  });

  test("a spectator takes a freed seat in the lobby", () => {
    const s = setup({ maxPlayers: 2 });
    s.hub.join(U1);
    s.hub.join(U2);
    s.hub.join(U3);
    expect(s.room.roleOf(U3)).toBe("spectator");
    s.hub.leave(U2);
    expect(s.room.roleOf(U3)).toBe("player");
    expect(s.hub.last(U3, "roster").players.find((p) => p.userId === U3)?.role).toBe("player");
  });

  test("when only a spectator is left in the lobby, they sit and lead", () => {
    const s = setup({ maxPlayers: 1 });
    s.hub.join(U1);
    s.hub.join(U2);
    s.hub.leave(U1);
    expect(s.room.roleOf(U2)).toBe("player");
    expect(s.room.hostId).toBe(U2);
  });
});

describe("configuration", () => {
  test("a valid change is broadcast", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.configure({ questionCount: 6, categories: ["characters", "sagas"] }));
    for (const id of [U1, U2])
      expect(s.hub.last(id, "config").config).toEqual({
        questionCount: 6,
        categories: ["characters", "sagas"],
      });
    s.hub.send(U1, msg.configure({ questionCount: 9 }));
    expect(s.room.config).toEqual({ questionCount: 9, categories: ["characters", "sagas"] });
  });

  test("categories the bank cannot serve are dropped; none left is refused", () => {
    const s = lobby(1);
    s.hub.send(U1, msg.configure({ categories: ["characters", "databooks"] }));
    expect(s.room.config.categories).toEqual(["characters"]);
    s.hub.clear();
    s.hub.send(U1, msg.configure({ categories: ["databooks"] }));
    expect(s.hub.errors(U1)).toEqual(["not_enough_questions"]);
    expect(s.room.config.categories).toEqual(["characters"]);
  });

  test("cannot be changed during a round", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    s.hub.clear();
    s.hub.send(U1, msg.configure({ questionCount: 5 }));
    expect(s.hub.errors(U1)).toEqual(["wrong_phase"]);
  });
});

describe("starting", () => {
  test("starts a round for the seated players, who all see the first question", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.start());
    expect(s.room.phase).toBe("round");
    for (const id of [U1, U2, U3]) {
      const question = s.hub.last(id, "question").question;
      expect(question).toMatchObject({ index: 0, total: 8, startedAt: s.clock.now() });
      expect(question.deadlineAt).toBe(s.clock.now() + QUESTION_MS);
      expect(s.hub.last(id, "phase").phase).toBe("round");
    }
    expect(s.room.roundQuestionIds).toHaveLength(8);
  });

  test("the number of questions follows the configuration", () => {
    const s = lobby(1);
    s.hub.send(U1, msg.configure({ questionCount: 5 }));
    s.hub.send(U1, msg.start());
    expect(s.hub.last(U1, "question").question.total).toBe(5);
  });

  test("a player can start alone", () => {
    const s = lobby(1);
    s.hub.send(U1, msg.start());
    expect(s.room.phase).toBe("round");
  });

  test("a bank too small for the categories refuses to start", () => {
    const s = setup({}, 4);
    s.hub.join(U1);
    s.hub.clear();
    s.hub.send(U1, msg.start());
    expect(s.hub.errors(U1)).toEqual(["not_enough_questions"]);
    expect(s.room.phase).toBe("lobby");
  });

  test("a bank with five questions plays a five-question round even if eight were asked", () => {
    const s = setup({}, 5);
    s.hub.join(U1);
    s.hub.send(U1, msg.start());
    expect(s.hub.last(U1, "question").question.total).toBe(5);
  });

  test("cannot start twice", () => {
    const s = lobby(1);
    s.hub.send(U1, msg.start());
    s.hub.clear();
    s.hub.send(U1, msg.start());
    expect(s.hub.errors(U1)).toEqual(["wrong_phase"]);
  });

  test("avoids the questions the members saw recently, when given", () => {
    const bank = makeBank(20);
    const seen = new Set(
      bank
        .all()
        .slice(0, 12)
        .map((q) => q.id),
    );
    let asked: readonly string[] = [];
    const room = new Room({
      instanceId: "i-seen",
      clock: new ManualClock(),
      rng: seededRng("seen"),
      bank,
      recentlySeen: (ids) => {
        asked = ids;
        return seen;
      },
    });
    const hub = new Hub(room);
    hub.join(U1);
    hub.join(U2);
    hub.send(U1, msg.start());
    expect(asked.toSorted()).toEqual([U1, U2]);
    expect(room.roundQuestionIds.every((id) => !seen.has(id))).toBe(true);
  });
});

describe("answering", () => {
  test("the answerer is acknowledged and everyone sees the progress, not the choice", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.hub.clear();
    s.clock.advance(2_000);
    s.hub.send(U2, msg.answer(question.roundId, 0, 2));
    expect(s.hub.messages(U2, "answer_ack")).toEqual([
      { v: 1, type: "answer_ack", roundId: question.roundId, index: 0, choice: 2 },
    ]);
    expect(s.hub.messages(U1, "answer_ack")).toHaveLength(0);
    for (const id of [U1, U2, U3])
      expect(s.hub.last(id, "progress")).toMatchObject({ index: 0, answered: [U2], expected: 3 });
    expect(JSON.stringify(s.hub.all.filter((m) => m.to === U1))).not.toContain('"choice"');
  });

  test("when everyone answered the question is revealed at once, with the answer and its source", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    const right = correctChoice(question);
    s.clock.advance(2_000);
    s.hub.send(U1, msg.answer(question.roundId, 0, right));
    expect(s.hub.messages(U2, "reveal")).toHaveLength(0);
    s.clock.advance(1_000);
    s.hub.send(U2, msg.answer(question.roundId, 0, (right + 1) % 4));
    const reveal = s.hub.last(U1, "reveal").reveal;
    expect(reveal).toMatchObject({ index: 0, correct: right, source: { type: "lexicon" } });
    expect(reveal.source).toEqual({ type: "lexicon", id: expect.stringMatching(/^q\d+$/) });
    expect(reveal.answers).toEqual([
      { userId: U1, choice: right, points: 933 },
      { userId: U2, choice: (right + 1) % 4, points: 0 },
    ]);
    expect(reveal.ranking.map((r) => [r.userId, r.rank, r.score])).toEqual([
      [U1, 1, 933],
      [U2, 2, 0],
    ]);
    expect(reveal.nextAt).toBe(s.clock.now() + REVEAL_MS);
    expect(s.room.snapshotFor(U1).players.find((p) => p.userId === U1)?.score).toBe(933);
  });

  test("the deadline reveals the question for those who stayed silent", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.advance(3_000);
    s.hub.send(U1, msg.answer(question.roundId, 0, correctChoice(question)));
    s.clock.set(question.deadlineAt - 1);
    s.hub.tick();
    expect(s.hub.messages(U2, "reveal")).toHaveLength(0);
    s.clock.advance(1);
    s.hub.tick();
    expect(s.hub.last(U2, "reveal").reveal.answers.find((a) => a.userId === U2)).toEqual({
      userId: U2,
      choice: null,
      points: 0,
    });
  });

  test("an answer that arrives after the deadline is late even if nobody ticked", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.set(question.deadlineAt + 500);
    s.hub.clear();
    // No tick: `receive` plays out the deadline first.
    s.hub.send(U1, msg.answer(question.roundId, 0, correctChoice(question)));
    expect(s.hub.errors(U1)).toEqual(["question_closed"]);
    expect(s.hub.last(U2, "reveal").reveal.index).toBe(0);
  });

  test("a spectator cannot answer; outside a round nobody can", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.answer("a-1", 0, 0));
    expect(s.hub.errors(U1)).toEqual(["wrong_phase"]);
    s.hub.send(U1, msg.start());
    s.hub.join(U3);
    s.hub.clear();
    const question = currentQuestion(s);
    s.clock.advance(2_000);
    s.hub.send(U3, msg.answer(question.roundId, 0, 0));
    expect(s.hub.errors(U3)).toEqual(["not_player"]);
  });

  test("a second answer, a wrong question, a wrong round and an implausibly fast answer are refused", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.advance(300);
    s.hub.send(U1, msg.answer(question.roundId, 0, 0));
    expect(s.hub.errors(U1)).toEqual(["too_fast"]);
    s.hub.clear();
    s.clock.advance(1_000);
    s.hub.send(U1, msg.answer(question.roundId, 0, 0));
    s.hub.send(U1, msg.answer(question.roundId, 0, 1));
    s.hub.send(U2, msg.answer(question.roundId, 1, 1));
    s.hub.send(U2, msg.answer("zzzz-9", 0, 1));
    expect(s.hub.errors(U1)).toEqual(["already_answered"]);
    expect(s.hub.errors(U2)).toEqual(["wrong_question", "wrong_round"]);
    // The first answer stands.
    expect(s.hub.messages(U1, "answer_ack")).toHaveLength(1);
  });
});

describe("a whole round", () => {
  test("ends with the final ranking, the results phase and a receipt that only the podium is paid by", async () => {
    const s = lobby(4);
    playRound(s, () => ({ [U1]: "right", [U2]: "right", [U3]: "wrong", [U4]: "skip" }));
    expect(s.room.phase).toBe("results");
    const results = s.hub.last(U1, "results");
    expect(results.ranking.map((r) => [r.userId, r.rank])).toEqual([
      [U1, 1],
      [U2, 2],
      [U3, 3],
      [U4, 3],
    ]);
    expect(s.hub.last(U4, "phase").phase).toBe("results");

    // The receipt: 60 and 40 to the two who scored, nothing to the others.
    expect(s.settlements).toHaveLength(1);
    const receipt = s.settlements[0]!;
    expect(s.room.settlement).toBe(receipt);
    expect(receipt).toMatchObject({ instanceId: "i-1234-gc-5678-9012", questionCount: 5 });
    expect(receipt.entries.map((e) => [e.userId, e.zeni, e.reason])).toEqual([
      [U1, 60, "podium"],
      [U2, 40, "podium"],
      [U3, 0, "no_points"],
      [U4, 0, "no_points"],
    ]);
    // Nothing was announced as paid yet: the bot has not answered.
    expect(s.hub.messages(U1, "settled")).toHaveLength(0);
    expect(s.room.snapshotFor(U1).settled).toBeNull();

    // The server signs; the bot verifies.
    const signed = await signReceipt(receipt, SECRET);
    expect(await verifyReceipt(signed, SECRET, { now: s.clock.now() })).toMatchObject({ ok: true });
  });

  test("what the bot paid is relayed to the room, once, for the right round", () => {
    const s = lobby(2);
    playRound(s, () => ({ [U1]: "right", [U2]: "right" }));
    const receipt = s.settlements[0]!;
    s.hub.deliver(
      s.room.applySettled({
        roundId: "another-1",
        rewards: [{ userId: U1, zeni: 60, reason: "podium" }],
      }),
    );
    expect(s.hub.messages(U1, "settled")).toHaveLength(0);
    const settled = {
      roundId: receipt.roundId,
      rewards: [
        { userId: U1, zeni: 30, reason: "daily_budget" as const },
        { userId: U2, zeni: 0, reason: "off_podium" as const },
      ],
    };
    s.hub.deliver(s.room.applySettled(settled));
    for (const id of [U1, U2]) expect(s.hub.last(id, "settled").settled).toEqual(settled);
    expect(s.room.snapshotFor(U1).settled).toEqual(settled);
  });

  test("a failing settlement callback does not lose the room's messages; the receipt stays available", () => {
    const clock = new ManualClock();
    const room = new Room({
      instanceId: "i-throws",
      clock,
      rng: seededRng("throws"),
      bank: makeBank(),
      onSettlement: () => {
        throw new Error("the signer is down");
      },
    });
    const s = { clock, room, hub: new Hub(room), settlements: [] as SettlementReceipt[] };
    s.hub.join(U1);
    s.hub.join(U2);
    playRound(s, () => ({ [U1]: "right", [U2]: "right" }));
    expect(s.room.phase).toBe("results");
    expect(s.hub.messages(U1, "results")).toHaveLength(1);
    expect(s.room.settlement?.entries.map((e) => e.zeni)).toEqual([60, 40]);
  });

  test("playing alone pays nothing and says so straight away", () => {
    const s = lobby(1);
    playRound(s, () => ({ [U1]: "right" }));
    expect(s.room.phase).toBe("results");
    expect(s.settlements).toHaveLength(0);
    expect(s.hub.last(U1, "settled").settled.rewards).toEqual([
      { userId: U1, zeni: 0, reason: "solo" },
    ]);
  });

  test("the roster scores follow the round and the reveal resends it", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.advance(2_000);
    s.hub.send(U1, msg.answer(question.roundId, 0, correctChoice(question)));
    s.hub.send(U2, msg.answer(question.roundId, 0, correctChoice(question)));
    const roster = s.hub.last(U1, "roster").players;
    expect(roster.map((p) => p.score)).toEqual([933, 933]);
    expect(roster.every((p) => p.answered)).toBe(true);
  });

  test("the players get a new question each time, timed from when it is sent", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    playQuestion(s, { [U1]: "right", [U2]: "right" });
    const second = s.hub.last(U1, "question").question;
    expect(second.index).toBe(1);
    expect(second.startedAt).toBe(s.clock.now());
    expect(second.deadlineAt).toBe(s.clock.now() + QUESTION_MS);
  });

  test("no question is asked twice in a round", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    expect(new Set(s.room.roundQuestionIds).size).toBe(8);
  });

  test("a member who leaves mid-round stays in the ranking and is not waited for", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.advance(2_000);
    s.hub.send(U1, msg.answer(question.roundId, 0, correctChoice(question)));
    s.hub.send(U2, msg.answer(question.roundId, 0, correctChoice(question)));
    s.hub.leave(U3);
    expect(s.hub.last(U1, "reveal").reveal.index).toBe(0);
    expect(s.room.snapshotFor(U1).players.find((p) => p.userId === U3)?.status).toBe("offline");
  });

  test("the host leaving mid-round hands the lead over", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.start());
    s.hub.leave(U1);
    expect(s.room.hostId).toBe(U2);
    expect(s.room.roleOf(U1)).toBe("player");
  });
});

describe("after the round", () => {
  function finished(): Setup {
    const s = lobby(3);
    playRound(s, () => ({ [U1]: "right", [U2]: "right", [U3]: "wrong" }));
    return s;
  }

  test("the host starts another round: back to the lobby, scores cleared", () => {
    const s = finished();
    s.hub.send(U1, msg.playAgain());
    expect(s.room.phase).toBe("lobby");
    expect(s.hub.last(U2, "phase").phase).toBe("lobby");
    expect(s.hub.last(U2, "config").config.questionCount).toBe(5);
    expect(s.room.snapshotFor(U1)).toMatchObject({ ranking: [], settled: null, round: null });
    expect(s.room.snapshotFor(U1).players.every((p) => p.score === 0)).toBe(true);
    s.hub.send(U1, msg.start());
    expect(s.room.phase).toBe("round");
    expect(s.settlements).toHaveLength(1);
  });

  test("only in the results phase, only by the host", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.playAgain());
    expect(s.hub.errors(U1)).toEqual(["wrong_phase"]);
    const done = finished();
    done.hub.clear();
    done.hub.send(U2, msg.playAgain());
    expect(done.hub.errors(U2)).toEqual(["not_host"]);
  });

  test("the room returns to the lobby by itself after the hold", () => {
    const s = finished();
    s.clock.advance(DEFAULT_ROOM_LIMITS.resultsHoldMs - 1_000);
    s.hub.send(U1, msg.ping());
    s.hub.send(U2, msg.ping());
    s.hub.send(U3, msg.ping());
    expect(s.room.phase).toBe("results");
    s.clock.advance(1_000);
    s.hub.tick();
    expect(s.room.phase).toBe("lobby");
  });

  test("members who left during the results are gone; watchers take free seats", () => {
    const s = setup({ maxPlayers: 3 });
    for (const id of [U1, U2, U3]) s.hub.join(id);
    s.hub.join(U4);
    expect(s.room.roleOf(U4)).toBe("spectator");
    playRound(s, () => ({ [U1]: "right", [U2]: "right", [U3]: "wrong" }));
    s.hub.leave(U3);
    expect(s.room.has(U3)).toBe(false);
    s.hub.send(U1, msg.playAgain());
    expect(s.room.roleOf(U4)).toBe("player");
  });

  test("a member who dropped mid-round is removed at the end, and can come back", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.start());
    s.hub.leave(U3);
    for (let i = 0; i < 8; i++) playQuestion(s, { [U1]: "right", [U2]: "right" });
    expect(s.room.phase).toBe("results");
    expect(s.room.has(U3)).toBe(true);
    s.hub.send(U1, msg.playAgain());
    expect(s.room.has(U3)).toBe(false);
    expect(s.hub.join(U3)).toMatchObject({ admitted: true, role: "player" });
  });
});

describe("kicking", () => {
  test("the host removes a member, who is told and cannot come back", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.kick(U3));
    expect(s.hub.last(U3, "kicked").reason).toBe("host");
    expect(s.room.has(U3)).toBe(false);
    expect(s.hub.last(U2, "roster").players.map((p) => p.userId)).toEqual([U1, U2]);
    expect(s.hub.join(U3)).toMatchObject({ admitted: false, code: "banned" });
  });

  test("not oneself, not a stranger", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.kick(U1));
    s.hub.send(U1, msg.kick(U4));
    expect(s.hub.errors(U1)).toEqual(["invalid_target", "invalid_target"]);
  });

  test("a kicked player leaves the running round, its ranking and its rewards", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.start());
    s.hub.send(U1, msg.kick(U3));
    for (let i = 0; i < 8; i++) playQuestion(s, { [U1]: "right", [U2]: "right" });
    expect(s.hub.last(U1, "results").ranking.map((r) => r.userId)).toEqual([U1, U2]);
    expect(s.settlements[0]?.entries.map((e) => e.userId)).toEqual([U1, U2]);
  });

  test("kicking the last unanswered player reveals the question", () => {
    const s = lobby(3);
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.advance(2_000);
    s.hub.send(U1, msg.answer(question.roundId, 0, 0));
    s.hub.send(U2, msg.answer(question.roundId, 0, 0));
    expect(s.hub.messages(U1, "reveal")).toHaveLength(0);
    s.hub.send(U1, msg.kick(U3));
    expect(s.hub.messages(U1, "reveal")).toHaveLength(1);
  });
});

describe("anti-spam", () => {
  test("a burst is allowed, the excess is refused with a wait, and the bucket refills", () => {
    const s = lobby(1);
    const { burst, refillPerSecond } = DEFAULT_ROOM_LIMITS.rate;
    for (let i = 0; i < burst; i++) s.hub.send(U1, msg.ping(i));
    expect(s.hub.messages(U1, "pong")).toHaveLength(burst);
    s.hub.send(U1, msg.ping(99));
    const error = s.hub.last(U1, "error");
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterMs).toBe(Math.ceil(1000 / refillPerSecond));
    expect(s.hub.messages(U1, "pong")).toHaveLength(burst);
    s.clock.advance(error.retryAfterMs!);
    s.hub.send(U1, msg.ping(100));
    expect(s.hub.last(U1, "pong").t).toBe(100);
  });

  test("a flood gets the member removed for spam, and banned", () => {
    const s = lobby(2, { maxViolations: 5 });
    for (let i = 0; i < 12 + 5; i++) s.hub.send(U2, msg.ping(i));
    expect(s.hub.last(U2, "kicked").reason).toBe("spam");
    expect(s.room.has(U2)).toBe(false);
    expect(s.hub.join(U2)).toMatchObject({ admitted: false, code: "banned" });
    expect(s.hub.last(U1, "roster").players.map((p) => p.userId)).toEqual([U1]);
  });

  test("answering the same question over and over counts as spam", () => {
    const s = lobby(2, { maxViolations: 3 });
    s.hub.send(U1, msg.start());
    const question = currentQuestion(s);
    s.clock.advance(2_000);
    s.hub.send(U2, msg.answer(question.roundId, 0, 1));
    for (let i = 0; i < 3; i++) {
      s.clock.advance(300);
      s.hub.send(U2, msg.answer(question.roundId, 0, 2));
    }
    expect(s.hub.messages(U2, "kicked")).toHaveLength(1);
    expect(s.hub.errors(U2)).toEqual(["already_answered", "already_answered"]);
  });

  test("a normal player never meets the limit: one message a second for a whole round", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    for (let i = 0; i < 60; i++) {
      s.clock.advance(1_000);
      s.hub.send(U2, msg.ping());
    }
    expect(s.hub.errors(U2)).toEqual([]);
  });

  test("messages from someone who is not in the room are ignored", () => {
    const s = lobby(1);
    s.hub.deliver(s.room.receive(U4, msg.start()));
    expect(s.room.phase).toBe("lobby");
    expect(s.hub.inboxes.get(U4)).toBeUndefined();
  });

  test("a ping is answered with the echo and the server's time", () => {
    const s = lobby(1);
    s.hub.send(U1, msg.ping(42));
    expect(s.hub.last(U1, "pong")).toEqual({
      v: 1,
      type: "pong",
      t: 42,
      serverTime: s.clock.now(),
    });
    s.hub.send(U1, msg.ping());
    expect("t" in s.hub.last(U1, "pong")).toBe(false);
  });
});

describe("presence, expiry and limits", () => {
  const { presenceTimeoutMs, idleTimeoutMs, emptyGraceMs, maxDurationMs } = DEFAULT_ROOM_LIMITS;

  test("a silent member is dropped from the lobby; heartbeats keep one alive", () => {
    const s = lobby(2);
    for (let elapsed = 0; elapsed < presenceTimeoutMs * 2; elapsed += 15_000) {
      s.clock.advance(15_000);
      s.hub.send(U1, msg.ping());
    }
    expect(s.room.has(U1)).toBe(true);
    expect(s.room.has(U2)).toBe(false);
    expect(s.hub.last(U1, "roster").players.map((p) => p.userId)).toEqual([U1]);
  });

  test("a silent host hands the lead over", () => {
    const s = lobby(2);
    s.clock.advance(presenceTimeoutMs - 1);
    s.hub.send(U2, msg.ping());
    s.clock.advance(1);
    s.hub.tick();
    expect(s.room.hostId).toBe(U2);
    expect(s.room.has(U1)).toBe(false);
  });

  test("a silent player in a round goes offline but keeps their place", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.start());
    s.clock.advance(presenceTimeoutMs - 1);
    s.hub.send(U1, msg.ping());
    s.clock.advance(1);
    s.hub.tick();
    expect(s.room.has(U2)).toBe(true);
    expect(s.room.snapshotFor(U1).players.find((p) => p.userId === U2)?.status).toBe("offline");
  });

  test("an empty room closes after the grace period, not before", () => {
    const s = lobby(1);
    s.hub.leave(U1);
    s.clock.advance(emptyGraceMs - 1);
    s.hub.tick();
    expect(s.room.isClosed).toBe(false);
    s.clock.advance(1);
    s.hub.tick();
    expect(s.room.closedReason).toBe("empty");
  });

  test("coming back within the grace period keeps the room", () => {
    const s = lobby(1);
    s.hub.leave(U1);
    s.clock.advance(emptyGraceMs - 1);
    s.hub.join(U1);
    s.clock.advance(emptyGraceMs * 3);
    s.hub.send(U1, msg.ping());
    expect(s.room.isClosed).toBe(false);
  });

  test("a room nobody acts in expires, even though heartbeats continue", () => {
    const s = lobby(2);
    let elapsed = 0;
    while (elapsed < idleTimeoutMs - 15_000) {
      s.clock.advance(15_000);
      elapsed += 15_000;
      s.hub.send(U1, msg.ping());
      s.hub.send(U2, msg.ping());
    }
    expect(s.room.isClosed).toBe(false);
    s.clock.advance(15_000);
    s.hub.send(U1, msg.ping());
    expect(s.room.closedReason).toBe("expired");
    expect(s.hub.last(U2, "closed").reason).toBe("expired");
  });

  test("real activity keeps a room alive, up to its maximum duration", () => {
    const s = lobby(1, { idleTimeoutMs: 10 * 60_000, maxDurationMs: 60 * 60_000 });
    const step = 15_000;
    // Heartbeats every 15 s and a real action every 5 minutes: never idle, never silent.
    for (let elapsed = step; elapsed < 59 * 60_000; elapsed += step) {
      s.clock.advance(step);
      s.hub.send(U1, msg.ping());
      if (elapsed % (5 * 60_000) === 0)
        s.hub.send(U1, msg.configure({ questionCount: 5 + ((elapsed / step) % 2) }));
    }
    expect(s.room.isClosed).toBe(false);
    s.clock.advance(2 * 60_000);
    s.hub.send(U1, msg.ping());
    expect(s.room.closedReason).toBe("max_duration");
    expect(s.hub.last(U1, "closed").reason).toBe("max_duration");
    expect(maxDurationMs).toBe(2 * 60 * 60_000);
  });

  test("a closed room refuses newcomers and ignores messages", () => {
    const s = lobby(1);
    s.hub.deliver(s.room.close("shutdown"));
    expect(s.hub.last(U1, "closed").reason).toBe("shutdown");
    expect(s.room.close("shutdown")).toEqual([]);
    expect(s.hub.join(U2)).toMatchObject({ admitted: false, code: "room_closed" });
    expect(s.room.receive(U1, msg.start())).toEqual([]);
    expect(s.room.nextDeadline()).toBeNull();
  });

  test("nextDeadline is the earliest thing to do", () => {
    const s = lobby(1);
    const start = s.clock.now();
    expect(s.room.nextDeadline()).toBe(start + presenceTimeoutMs);
    s.hub.send(U1, msg.start());
    // The question closes before anyone could be considered gone.
    expect(s.room.nextDeadline()).toBe(start + QUESTION_MS);
    s.clock.advance(QUESTION_MS);
    s.hub.send(U1, msg.ping());
    expect(s.room.nextDeadline()).toBe(start + QUESTION_MS + REVEAL_MS);
  });

  test("an empty lobby is due to close when the grace period ends", () => {
    const s = lobby(1);
    s.clock.advance(10_000);
    s.hub.leave(U1);
    expect(s.room.nextDeadline()).toBe(s.clock.now() + emptyGraceMs);
  });

  test("ticking at nextDeadline is enough to drive a whole round, answers or not", () => {
    const s = lobby(2);
    s.hub.send(U1, msg.configure({ questionCount: 5 }));
    s.hub.send(U1, msg.start());
    let guard = 0;
    while (s.room.phase === "round" && guard++ < 100) {
      s.hub.send(U1, msg.ping());
      s.hub.send(U2, msg.ping());
      s.clock.set(s.room.nextDeadline()!);
      s.hub.tick();
    }
    expect(s.room.phase).toBe("results");
    expect(guard).toBeLessThan(100);
  });
});

describe("every message is valid", () => {
  test("a full session only ever emits messages that satisfy the protocol schema", () => {
    // The Hub parses every delivered message with ServerMessageSchema and throws on a bad one.
    const s = lobby(4);
    s.hub.join(user(5));
    s.hub.send(U1, msg.configure({ questionCount: 6, categories: ["characters", "techniques"] }));
    playRound(
      s,
      (i) => ({ [U1]: "right", [U2]: i % 2 ? "wrong" : "right", [U3]: "skip", [U4]: "right" }),
      6,
    );
    s.hub.send(U1, msg.kick(U3));
    s.hub.send(U1, msg.playAgain());
    s.hub.leave(U2);
    s.hub.send(U1, msg.leave());
    expect(s.hub.all.length).toBeGreaterThan(50);
    expect(new Set(s.hub.all.map((m) => m.message.v))).toEqual(new Set([1]));
  });
});
