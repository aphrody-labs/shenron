// SPDX-License-Identifier: Apache-2.0
/**
 * The client reducer replays a real room: the messages come from `Room` itself (manual clock, no
 * socket), routed to what the second player would receive, then folded into the client state.
 */
import { describe, expect, test } from "bun:test";
import { seededRng } from "@aphrody/shenron-activity";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@aphrody/shenron-activity/protocol";
import { Room, type Outbound } from "@aphrody/shenron-activity/rooms";
import { ManualClock } from "@aphrody/shenron-activity/testing";
import {
  answerOf,
  initialState,
  isHost,
  msLeft,
  ownRanking,
  pointsOf,
  reduce,
  selectedChoice,
  type GameEvent,
  type GameState,
} from "../client/state";
import { correctChoice, FAST_LIMITS, INSTANCE, testBank, U1, U2, U3 } from "./support";

class Replay {
  readonly clock = new ManualClock();
  readonly room = new Room({
    instanceId: INSTANCE,
    clock: this.clock,
    rng: seededRng("client-state"),
    bank: testBank(),
    limits: {
      ...FAST_LIMITS,
      session: { ...FAST_LIMITS.session, questionTimeMs: 10_000, minAnswerMs: 0 },
    },
  });
  /** What the second player's client holds. */
  state: GameState = initialState;

  /** Folds what the room addressed to `U2` (or to everyone) into the client state. */
  feed(out: readonly Outbound[], forUser = U2): void {
    for (const { target, message } of out) {
      const seen =
        target.to === "all" ||
        (target.to === "user" && target.userId === forUser) ||
        (target.to === "others" && target.userId !== forUser);
      if (seen) this.apply({ type: "server", message, receivedAt: this.clock.now() });
    }
  }

  apply(event: GameEvent): void {
    this.state = reduce(this.state, event);
  }

  send(userId: string, message: ClientMessage): void {
    this.feed(this.room.receive(userId, message));
  }

  join(userId: string, name: string): void {
    this.feed(this.room.join({ userId, name }).out);
  }
}

const start = (): ClientMessage => ({ v: PROTOCOL_VERSION, type: "start" });

function lobbyOfThree(): Replay {
  const replay = new Replay();
  replay.join(U1, "Son Goku");
  replay.join(U2, "Vegeta");
  replay.join(U3, "Bulma");
  return replay;
}

describe("client state", () => {
  test("boots, then the welcome gives the room", () => {
    const replay = new Replay();
    expect(replay.state.connection).toBe("booting");
    replay.apply({ type: "boot", step: "auth" });
    expect(replay.state).toMatchObject({ connection: "booting", bootStep: "auth" });
    replay.apply({ type: "connecting" });
    expect(replay.state).toMatchObject({ connection: "connecting", bootStep: "room" });

    replay.join(U1, "Son Goku");
    replay.join(U2, "Vegeta");
    expect(replay.state.connection).toBe("online");
    expect(replay.state.you).toEqual({ userId: U2, role: "player" });
    expect(replay.state.room?.phase).toBe("lobby");
    expect(replay.state.room?.hostId).toBe(U1);
    expect(replay.state.room?.players.map((p) => p.name)).toEqual(["Son Goku", "Vegeta"]);
    expect(isHost(replay.state)).toBe(false);
  });

  test("rosters, configuration and a departing host", () => {
    const replay = lobbyOfThree();
    expect(replay.state.room?.players).toHaveLength(3);
    replay.send(U1, {
      v: PROTOCOL_VERSION,
      type: "configure",
      config: { questionCount: 6, categories: ["characters"] },
    });
    expect(replay.state.room?.config).toEqual({ questionCount: 6, categories: ["characters"] });
    replay.feed(replay.room.leave(U1));
    expect(replay.state.room?.hostId).toBe(U2);
    expect(isHost(replay.state)).toBe(true);
  });

  test("a whole round: question, instant click, ack, reveal, results, settlement", () => {
    const replay = lobbyOfThree();
    replay.send(U1, { v: PROTOCOL_VERSION, type: "configure", config: { questionCount: 5 } });
    replay.send(U1, start());
    expect(replay.state.room?.phase).toBe("round");
    const question = replay.state.room!.question!;
    expect(question).toMatchObject({ index: 0, total: 5 });
    expect(replay.state.room?.step).toBe("question");
    expect(replay.state.room?.reveal).toBeNull();
    // Everyone present is awaited, from the first moment (not only after a first answer).
    expect(replay.state.room?.expected).toBe(3);
    // The right answer is not in the state before the reveal.
    expect(JSON.stringify(replay.state)).not.toContain('"correct"');

    // The click shows at once; the server's ack confirms it.
    const right = correctChoice(question);
    replay.apply({ type: "localAnswer", index: 0, choice: right });
    expect(selectedChoice(replay.state.room!)).toBe(right);
    expect(replay.state.room?.yourChoice).toBeNull();
    // A second click before the ack is ignored.
    replay.apply({ type: "localAnswer", index: 0, choice: (right + 1) % 4 });
    expect(selectedChoice(replay.state.room!)).toBe(right);
    replay.clock.advance(1_000);
    replay.send(U2, {
      v: PROTOCOL_VERSION,
      type: "answer",
      roundId: question.roundId,
      index: 0,
      choice: right,
    });
    expect(replay.state.room).toMatchObject({ yourChoice: right, pending: null });
    expect(replay.state.room?.answered).toContain(U2);

    // The two others answer: the question is revealed.
    replay.clock.advance(1_000);
    replay.send(U1, {
      v: PROTOCOL_VERSION,
      type: "answer",
      roundId: question.roundId,
      index: 0,
      choice: right,
    });
    replay.send(U3, {
      v: PROTOCOL_VERSION,
      type: "answer",
      roundId: question.roundId,
      index: 0,
      choice: (right + 1) % 4,
    });
    const room = replay.state.room!;
    expect(room.step).toBe("reveal");
    expect(room.reveal?.correct).toBe(right);
    expect(answerOf(room.reveal, U2)).toBe(right);
    expect(answerOf(room.reveal, U3)).toBe((right + 1) % 4);
    expect(pointsOf(room.reveal, U2)).toBeGreaterThan(500);
    expect(pointsOf(room.reveal, U3)).toBe(0);
    // U2 answered first, U1 a second later, U3 got it wrong.
    expect(room.ranking.map((entry) => entry.userId)).toEqual([U2, U1, U3]);
    expect(ownRanking(replay.state)?.rank).toBe(1);

    // The next question clears the previous one.
    replay.clock.advance(FAST_LIMITS.session.revealMs + 10);
    replay.feed(replay.room.tick());
    expect(replay.state.room).toMatchObject({
      step: "question",
      yourChoice: null,
      pending: null,
      reveal: null,
    });
    expect(replay.state.room?.question?.index).toBe(1);

    // Play the remaining questions out: U1 and U2 answer rightly, U3 lets the clock run.
    for (let i = 1; i < 5; i++) {
      const current = replay.state.room!.question!;
      expect(current.index).toBe(i);
      replay.clock.advance(600);
      replay.send(U1, {
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: current.roundId,
        index: i,
        choice: correctChoice(current),
      });
      replay.clock.advance(600);
      replay.send(U2, {
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: current.roundId,
        index: i,
        choice: correctChoice(current),
      });
      replay.clock.advance(10_001);
      replay.feed(replay.room.tick());
      expect(replay.state.room?.step === "reveal" || replay.state.room?.phase === "results").toBe(
        true,
      );
      replay.clock.advance(FAST_LIMITS.session.revealMs + 10);
      replay.feed(replay.room.tick());
    }
    expect(replay.state.room?.phase).toBe("results");
    expect(replay.state.room?.ranking.length).toBe(3);
    // The round pays someone: the screen waits for what the bot really paid.
    expect(replay.state.room?.settled).toBeNull();

    // The bot's answer arrives later.
    const roundId = replay.room.settlement!.roundId;
    replay.feed(
      replay.room.applySettled({
        roundId,
        rewards: [{ userId: U2, zeni: 40, reason: "podium" }],
      }),
    );
    expect(replay.state.room?.settled?.rewards[0]).toEqual({
      userId: U2,
      zeni: 40,
      reason: "podium",
    });

    // Back to the lobby wipes the round.
    replay.send(U1, { v: PROTOCOL_VERSION, type: "play_again" });
    expect(replay.state.room).toMatchObject({
      phase: "lobby",
      question: null,
      step: null,
      reveal: null,
      settled: null,
    });
    expect(replay.state.room?.ranking).toEqual([]);
  });

  test("a refused answer drops the pending click and raises a notice", () => {
    const replay = lobbyOfThree();
    replay.send(U1, start());
    const question = replay.state.room!.question!;
    replay.apply({ type: "localAnswer", index: 0, choice: 1 });
    expect(replay.state.room?.pending).toEqual({ index: 0, choice: 1 });
    replay.apply({
      type: "server",
      message: { v: PROTOCOL_VERSION, type: "error", code: "too_fast" },
      receivedAt: 0,
    });
    expect(replay.state.room?.pending).toBeNull();
    expect(selectedChoice(replay.state.room!)).toBeNull();
    expect(replay.state.notice).toBe("too_fast");
    replay.apply({ type: "dismissNotice" });
    expect(replay.state.notice).toBeNull();
    // A notice that is not about the answer leaves a pending click alone.
    replay.apply({ type: "localAnswer", index: 0, choice: 2 });
    replay.apply({
      type: "server",
      message: { v: PROTOCOL_VERSION, type: "error", code: "not_host" },
      receivedAt: 0,
    });
    expect(replay.state.room?.pending).toEqual({ index: 0, choice: 2 });
    expect(question.index).toBe(0);
  });

  test("answers for another question or round are ignored", () => {
    const replay = lobbyOfThree();
    replay.send(U1, start());
    const { roundId } = replay.state.room!.question!;
    const before = replay.state;
    const stray: ServerMessage[] = [
      { v: PROTOCOL_VERSION, type: "answer_ack", roundId, index: 3, choice: 1 },
      { v: PROTOCOL_VERSION, type: "answer_ack", roundId: "zz-1", index: 0, choice: 1 },
      {
        v: PROTOCOL_VERSION,
        type: "progress",
        roundId: "zz-1",
        index: 0,
        answered: [U1],
        expected: 3,
      },
    ];
    for (const message of stray) replay.apply({ type: "server", message, receivedAt: 0 });
    expect(replay.state.room).toEqual(before.room);
  });

  test("a late joiner is welcomed into the running question", () => {
    const replay = new Replay();
    replay.join(U1, "Son Goku");
    replay.join(U3, "Bulma");
    replay.send(U1, start());
    replay.clock.advance(500);
    // U2 arrives during the round: a spectator, with the question already on screen.
    replay.join(U2, "Vegeta");
    expect(replay.state.you).toEqual({ userId: U2, role: "spectator" });
    expect(replay.state.room?.phase).toBe("round");
    expect(replay.state.room?.question?.index).toBe(0);
    expect(replay.state.room?.step).toBe("question");
    // Spectators see the room's clock: the server's time sets the offset.
    expect(replay.state.clockOffset).toBe(0);
  });

  test("the countdown follows the server clock, not the local one", () => {
    const replay = lobbyOfThree();
    replay.send(U1, start());
    const question = replay.state.room!.question!;
    // The local clock is 5 s ahead of the server's: the offset corrects it.
    const localNow = replay.clock.now() + 5_000;
    replay.apply({
      type: "server",
      message: { v: PROTOCOL_VERSION, type: "pong", serverTime: replay.clock.now() },
      receivedAt: localNow,
    });
    // `pong` measures against Date.now(); pin the offset directly for a deterministic check.
    const pinned: GameState = { ...replay.state, clockOffset: -5_000 };
    expect(msLeft(pinned, localNow)).toBe(question.deadlineAt - replay.clock.now());
    expect(msLeft({ ...pinned, room: null }, localNow)).toBe(0);
    expect(msLeft(pinned, question.deadlineAt + 60_000)).toBe(0);
  });

  test("being kicked or a closed room fails the session; losing the socket only waits", () => {
    const replay = lobbyOfThree();
    replay.apply({ type: "socketLost" });
    expect(replay.state.connection).toBe("reconnecting");
    expect(replay.state.room).not.toBeNull();
    replay.apply({ type: "connecting" });
    expect(replay.state.connection).toBe("reconnecting");
    replay.send(U1, { v: PROTOCOL_VERSION, type: "kick", userId: U3 });
    // U2's view: U3 left the roster.
    expect(replay.state.room?.players.map((p) => p.userId)).toEqual([U1, U2]);
    replay.apply({
      type: "server",
      message: { v: PROTOCOL_VERSION, type: "kicked", reason: "host" },
      receivedAt: 0,
    });
    expect(replay.state).toMatchObject({
      connection: "failed",
      failure: { kind: "kicked", reason: "host" },
    });
    replay.apply({ type: "socketLost" });
    expect(replay.state.connection).toBe("failed");

    const closed = lobbyOfThree();
    closed.feed(closed.room.close("expired"));
    expect(closed.state.failure).toEqual({ kind: "roomClosed", reason: "expired" });
  });
});
