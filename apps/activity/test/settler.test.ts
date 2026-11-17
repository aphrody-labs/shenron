// SPDX-License-Identifier: Apache-2.0
/** Settlement queue: signing, retries, bounds, and what is given up. */
import { describe, expect, test } from "bun:test";
import {
  RECEIPT_TTL_MS,
  verifyReceipt,
  type SettlementReceipt,
} from "@aphrody/shenron-activity/quiz";
import { defaultBackoff, Settler, SETTLE_PATH } from "../src/settle/settler";
import { INSTANCE, SECRET, U1, U2 } from "./support";

function receipt(roundId = "kq9x2m7p-1", issuedAt = 1_800_000_000_000): SettlementReceipt {
  const key = (user: string) => `activity:${INSTANCE}:${roundId}:${user}`;
  return {
    v: 1,
    game: "quiz",
    mode: "room",
    instanceId: INSTANCE,
    roundId,
    issuedAt,
    expiresAt: issuedAt + RECEIPT_TTL_MS,
    questionCount: 5,
    policy: { podiumZeni: [60, 40, 20], perRoundCapZeni: 60 },
    entries: [
      {
        userId: U1,
        rank: 1,
        score: 4000,
        correct: 5,
        answered: 5,
        zeni: 60,
        reason: "podium",
        idempotencyKey: key(U1),
      },
      {
        userId: U2,
        rank: 2,
        score: 3000,
        correct: 4,
        answered: 5,
        zeni: 40,
        reason: "podium",
        idempotencyKey: key(U2),
      },
    ],
  };
}

function setup(
  responses: Array<() => Response | Promise<Response>>,
  overrides: Partial<ConstructorParameters<typeof Settler>[0]> = {},
) {
  let now = 1_800_000_100_000;
  const calls: Array<{ url: string; headers: Headers; body: any }> = [];
  const settled: Array<{ instanceId: string; roundId: string; zeni: number[] }> = [];
  const warnings: string[] = [];
  const settler = new Settler({
    secret: SECRET,
    botApiUrl: "http://bot.test",
    botApiToken: "service-token",
    now: () => now,
    backoffMs: () => 1_000,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      const respond = responses[Math.min(calls.length - 1, responses.length - 1)]!;
      return respond();
    }) as typeof fetch,
    onSettled: (instanceId, value) =>
      settled.push({ instanceId, roundId: value.roundId, zeni: value.rewards.map((r) => r.zeni) }),
    log: { info() {}, error() {}, warn: (message) => void warnings.push(message) },
    ...overrides,
  });
  return {
    settler,
    calls,
    settled,
    warnings,
    advance: (ms: number) => void (now += ms),
    now: () => now,
  };
}

/** The bot's `ActivitySettleResponse`: what it really paid, entry by entry. */
const answer = (
  lines: Array<{ userId: string; granted: number; reason: string; status?: string }> = [
    { userId: U1, granted: 60, reason: "podium" },
  ],
  roundId = "kq9x2m7p-1",
) => ({
  ok: true,
  instanceId: INSTANCE,
  roundId,
  replayed: false,
  totalGranted: lines.reduce((sum, line) => sum + line.granted, 0),
  totalXp: 5,
  entries: lines.map((line) => ({
    userId: line.userId,
    idempotencyKey: `activity:${INSTANCE}:${roundId}:${line.userId}`,
    status: line.status ?? "settled",
    requested: line.granted,
    granted: line.granted,
    reason: line.reason,
    xp: 5,
    xpCapped: false,
    levelUp: false,
    newLevel: null,
    budgetLeft: 100,
  })),
});
const ok = (lines?: Parameters<typeof answer>[0]) => () => Response.json(answer(lines));

describe("Settler", () => {
  test("signs the receipt, posts it with the service token, relays what was paid", async () => {
    const t = setup([ok()]);
    t.settler.enqueue(receipt());
    await t.settler.run();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.url).toBe(`http://bot.test${SETTLE_PATH}`);
    expect(t.calls[0]!.headers.get("authorization")).toBe("Bearer service-token");
    const verdict = await verifyReceipt(t.calls[0]!.body, SECRET, { now: t.now() });
    expect(verdict.ok).toBe(true);
    expect(t.settled).toEqual([{ instanceId: INSTANCE, roundId: "kq9x2m7p-1", zeni: [60] }]);
    expect(t.settler.pending).toBe(0);
    expect(t.settler.stats.settled).toBe(1);
    t.settler.stop();
  });

  test("a wrong secret on the bot side is detected by verification", async () => {
    const t = setup([ok()]);
    t.settler.enqueue(receipt());
    await t.settler.run();
    const verdict = await verifyReceipt(t.calls[0]!.body, "another-secret-of-sufficient-length", {
      now: t.now(),
    });
    expect(verdict).toMatchObject({ ok: false, reason: "bad_signature" });
    t.settler.stop();
  });

  test("keeps the receipt while the endpoint answers 404 or 5xx, then settles", async () => {
    const t = setup([
      () => new Response("", { status: 404 }),
      () => new Response("", { status: 503 }),
      ok(),
    ]);
    t.settler.enqueue(receipt());
    await t.settler.run();
    expect(t.settler.pending).toBe(1);
    // Not due yet: nothing is sent.
    await t.settler.run();
    expect(t.calls).toHaveLength(1);
    t.advance(1_001);
    await t.settler.run();
    expect(t.calls).toHaveLength(2);
    expect(t.settler.pending).toBe(1);
    t.advance(1_001);
    await t.settler.run();
    expect(t.settler.pending).toBe(0);
    expect(t.settled).toHaveLength(1);
    // Every attempt names the same payments, so the bot can dedupe.
    const keys = t.calls.map((call) => call.body.receipt.entries.map((e: any) => e.idempotencyKey));
    expect(keys[2]).toEqual(keys[0]);
    // And every attempt carries a fresh validity window.
    expect(t.calls[2]!.body.receipt.issuedAt).toBeGreaterThan(t.calls[0]!.body.receipt.issuedAt);
    t.settler.stop();
  });

  test("a bot that comes back much later still accepts the receipt", async () => {
    const t = setup([() => new Response("", { status: 404 }), ok()], { maxAgeMs: 3 * 60 * 60_000 });
    t.settler.enqueue(receipt());
    await t.settler.run();
    t.advance(60 * 60_000);
    await t.settler.run();
    expect(t.settled).toHaveLength(1);
    const verdict = await verifyReceipt(t.calls[1]!.body, SECRET, { now: t.now() });
    expect(verdict.ok).toBe(true);
    t.settler.stop();
  });

  test("an unreachable bot is retried", async () => {
    const t = setup([
      () => {
        throw new Error("ECONNREFUSED");
      },
      ok(),
    ]);
    t.settler.enqueue(receipt());
    await t.settler.run();
    expect(t.settler.pending).toBe(1);
    t.advance(1_001);
    await t.settler.run();
    expect(t.settler.pending).toBe(0);
    t.settler.stop();
  });

  test("a refusal of the receipt itself is final: it is dropped", async () => {
    for (const status of [400, 409, 410, 422]) {
      const t = setup([() => new Response("", { status })]);
      t.settler.enqueue(receipt());
      await t.settler.run();
      expect(t.settler.pending).toBe(0);
      expect(t.settler.stats.dropped).toBe(1);
      expect(t.settled).toEqual([]);
      t.advance(10_000);
      await t.settler.run();
      expect(t.calls).toHaveLength(1);
      t.settler.stop();
    }
  });

  test("a configuration mismatch (token, signature, service not configured) is retried", async () => {
    for (const status of [401, 403, 503]) {
      const t = setup([() => new Response("{}", { status }), ok()]);
      t.settler.enqueue(receipt());
      await t.settler.run();
      expect(t.settler.pending).toBe(1);
      expect(t.settler.stats.dropped).toBe(0);
      t.advance(1_001);
      await t.settler.run();
      expect(t.settler.pending).toBe(0);
      expect(t.settled).toHaveLength(1);
      t.settler.stop();
    }
  });

  test("the queue is bounded: the oldest receipt makes room", async () => {
    const t = setup([() => new Response("", { status: 404 })], { maxQueue: 3 });
    for (let i = 1; i <= 5; i++) {
      t.settler.enqueue(receipt(`kq9x2m7p-${i}`));
      await t.settler.run();
      t.advance(10);
    }
    expect(t.settler.pending).toBe(3);
    expect(t.settler.stats.dropped).toBe(2);
    t.settler.stop();
  });

  test("a receipt too old to be worth settling is given up", async () => {
    const t = setup([() => new Response("", { status: 404 })], { maxAgeMs: 60_000 });
    t.settler.enqueue(receipt());
    await t.settler.run();
    t.advance(61_000);
    await t.settler.run();
    expect(t.settler.pending).toBe(0);
    expect(t.settler.stats.dropped).toBe(1);
    t.settler.stop();
  });

  test("without a secret nothing is signed or sent", async () => {
    const t = setup([ok()], { secret: null });
    expect(t.settler.enabled).toBe(false);
    t.settler.enqueue(receipt());
    await t.settler.run();
    expect(t.calls).toHaveLength(0);
    expect(t.settler.stats.dropped).toBe(1);
    t.settler.stop();
  });

  test("an answer for another round is not relayed; an accepted receipt without usable answer is not retried", async () => {
    const other = setup([() => Response.json(answer(undefined, "zz9x2m7p-9"))]);
    other.settler.enqueue(receipt());
    await other.settler.run();
    expect(other.settled).toEqual([]);
    expect(other.settler.pending).toBe(0);
    other.settler.stop();

    const bare = setup([() => new Response("ok", { status: 200 })]);
    bare.settler.enqueue(receipt());
    await bare.settler.run();
    expect(bare.settler.pending).toBe(0);
    expect(bare.settled).toEqual([]);
    bare.settler.stop();
  });

  test("relays what was really granted, reason included, and ignores the bot's other fields", async () => {
    const t = setup([
      ok([
        { userId: U1, granted: 50, reason: "daily_budget" },
        { userId: U2, granted: 0, reason: "account_ineligible" },
      ]),
    ]);
    t.settler.enqueue(receipt());
    await t.settler.run();
    expect(t.settled).toEqual([{ instanceId: INSTANCE, roundId: "kq9x2m7p-1", zeni: [50, 0] }]);
    t.settler.stop();
  });

  test("a receipt the bot already settled reports what was paid then", async () => {
    const t = setup([ok([{ userId: U1, granted: 60, reason: "podium", status: "duplicate" }])]);
    t.settler.enqueue(receipt());
    await t.settler.run();
    expect(t.settled).toEqual([{ instanceId: INSTANCE, roundId: "kq9x2m7p-1", zeni: [60] }]);
    t.settler.stop();
  });

  test("an answer that does not follow the contract is not relayed, and not retried", async () => {
    const t = setup([() => Response.json({ rewards: [{ userId: U1, zeni: 60 }] })]);
    t.settler.enqueue(receipt());
    await t.settler.run();
    expect(t.settled).toEqual([]);
    expect(t.settler.pending).toBe(0);
    t.settler.stop();
  });

  test("the delay grows and is capped", () => {
    expect([1, 2, 3, 4].map(defaultBackoff)).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(defaultBackoff(30)).toBe(5 * 60_000);
  });

  test("a bot that is down does not flood the journal", async () => {
    const t = setup([() => new Response("", { status: 404 })]);
    for (let i = 0; i < 5; i++) {
      t.settler.enqueue(receipt(`kq9x2m7p-${i + 1}`));
      await t.settler.run();
    }
    expect(t.warnings.filter((w) => w === "settlement postponed")).toHaveLength(1);
    t.settler.stop();
  });
});
