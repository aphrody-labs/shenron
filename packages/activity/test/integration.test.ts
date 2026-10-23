// SPDX-License-Identifier: Apache-2.0
/**
 * End to end, without Discord and without network: the embedded lexicon bank feeds a registry room,
 * three members play a round through the protocol (JSON frames in, JSON frames out), the server
 * signs the receipt, the "bot" verifies it and applies its daily budget, and the room is told what
 * was really paid.
 */
import { describe, expect, test } from "bun:test";
import {
  applyDailyBudget,
  computeRoundRewards,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  RoomRegistry,
  seededRng,
  signReceipt,
  verifyReceipt,
  type ClientMessage,
  type Outbound,
  type PublicQuestion,
  type ServerMessage,
  type SettlementReceipt,
} from "../src";
import { lexiconQuizBank } from "../src/quiz/lexicon";
import { ManualClock } from "../src/testing";
import { U1, U2, U3 } from "./helpers";

const SECRET = "integration-secret-longer-than-sixteen";

class Wire {
  readonly received = new Map<string, ServerMessage[]>();
  constructor(readonly users: readonly string[]) {
    for (const user of users) this.received.set(user, []);
  }
  /** Delivers what the room emitted, through the JSON encoding the sockets would use. */
  deliver(out: readonly Outbound[]): void {
    for (const { target, message } of out) {
      const frame = JSON.stringify(message);
      const decoded = parseServerMessage(frame);
      expect(decoded).not.toBeNull();
      const to =
        target.to === "all"
          ? this.users
          : target.to === "user"
            ? [target.userId]
            : this.users.filter((u) => u !== target.userId);
      for (const user of to) this.received.get(user)?.push(decoded!);
    }
  }
  last<T extends ServerMessage["type"]>(user: string, type: T) {
    const found = (this.received.get(user) ?? []).findLast((m) => m.type === type);
    if (!found) throw new Error(`no ${type} for ${user}`);
    return found as Extract<ServerMessage, { type: T }>;
  }
}

describe("a Quiz Budokai round on the embedded lexicon bank", () => {
  test("plays, signs, verifies, caps by the daily budget, and tells the room", async () => {
    const clock = new ManualClock();
    const receipts: SettlementReceipt[] = [];
    const registry = new RoomRegistry({
      clock,
      rng: seededRng("integration"),
      bank: lexiconQuizBank(),
      onSettlement: (receipt) => receipts.push(receipt),
    });
    const room = registry.open("i-1234567890-gc-1111-2222")!;
    const wire = new Wire([U1, U2, U3]);
    const send = (user: string, message: ClientMessage) => {
      // What the socket does: the raw frame goes through the strict parser first.
      const parsed = parseClientMessage(JSON.stringify(message));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) wire.deliver(room.receive(user, parsed.message));
    };

    for (const [i, user] of [U1, U2, U3].entries()) {
      const result = room.join({ userId: user, name: `Fighter ${i + 1}` });
      expect(result.admitted).toBe(true);
      wire.deliver(result.out);
    }
    send(U1, {
      v: PROTOCOL_VERSION,
      type: "configure",
      config: { questionCount: 5, categories: ["characters", "techniques", "sagas"] },
    });
    send(U1, { v: PROTOCOL_VERSION, type: "start" });

    // The players read the question from the wire, never knowing the answer: they use the lexicon
    // the way a fan would, here by asking the bank (the test plays the all-knowing fan).
    const bank = lexiconQuizBank();
    const rightChoice = (question: PublicQuestion): number => {
      const match = bank.all().find((q) => q.prompt.fr === question.prompt.fr);
      if (!match) throw new Error("question not in the bank");
      return question.choices.findIndex((c) => c.fr === match.answer.text.fr);
    };

    for (let index = 0; index < 5; index++) {
      const question = wire.last(U1, "question").question;
      expect(question.index).toBe(index);
      expect(question.choices).toHaveLength(4);
      const right = rightChoice(question);
      expect(right).toBeGreaterThanOrEqual(0);
      // U1 knows it, U2 knows it more slowly, U3 guesses wrong.
      clock.set(question.startedAt + 2_000);
      send(U1, {
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: question.roundId,
        index,
        choice: right,
      });
      clock.set(question.startedAt + 5_000);
      send(U2, {
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: question.roundId,
        index,
        choice: right,
      });
      clock.set(question.startedAt + 6_000);
      send(U3, {
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: question.roundId,
        index,
        choice: (right + 1) % 4,
      });
      const reveal = wire.last(U1, "reveal").reveal;
      expect(reveal.correct).toBe(right);
      expect(reveal.source.type).toBe("lexicon");
      clock.advance(4_000);
      wire.deliver(room.tick());
    }

    expect(room.phase).toBe("results");
    expect(wire.last(U3, "results").ranking.map((r) => r.userId)).toEqual([U1, U2, U3]);

    // The server signs what the room produced; only the signed receipt travels to the bot.
    expect(receipts).toHaveLength(1);
    const signed = await signReceipt(receipts[0]!, SECRET);
    const wireReceipt = JSON.parse(JSON.stringify(signed));

    // The bot verifies it against its own clock and policy...
    const verdict = await verifyReceipt(wireReceipt, SECRET, { now: clock.now() + 1_000 });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.receipt.entries.map((e) => [e.userId, e.zeni])).toEqual([
      [U1, 60],
      [U2, 40],
      [U3, 0],
    ]);

    // ...applies the daily budget from its own logs (U1 already earned 580 today)...
    const lines = computeRoundRewards(
      verdict.receipt.entries.map((e) => ({
        userId: e.userId,
        score: e.score,
        correct: e.correct,
        answered: e.answered,
        correctElapsedMs: 0,
        flagged: false,
      })),
      verdict.receipt.questionCount,
    );
    const earned: Record<string, number> = { [U1]: 580 };
    const paid = applyDailyBudget(lines, (id) => earned[id] ?? 0);
    expect(paid.map((l) => [l.userId, l.granted])).toEqual([
      [U1, 20],
      [U2, 40],
      [U3, 0],
    ]);

    // ...and the room is told what was really credited.
    wire.deliver(
      room.applySettled({
        roundId: verdict.receipt.roundId,
        rewards: paid.map((l) => ({
          userId: l.userId,
          zeni: l.granted,
          reason: l.reasonAfterBudget,
        })),
      }),
    );
    expect(wire.last(U1, "settled").settled.rewards[0]).toEqual({
      userId: U1,
      zeni: 20,
      reason: "podium",
    });

    // A replay of the same receipt by anyone but the bot's idempotency table would pay twice: the
    // keys are what the bot dedupes on, and they are stable.
    const again = await verifyReceipt(wireReceipt, SECRET, { now: clock.now() + 2_000 });
    expect(again.ok && again.receipt.entries.map((e) => e.idempotencyKey)).toEqual(
      verdict.receipt.entries.map((e) => e.idempotencyKey),
    );
  });
});
