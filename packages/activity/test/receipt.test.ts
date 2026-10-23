// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  buildReceipt,
  canonicalJson,
  computeRoundRewards,
  DEFAULT_REWARD_POLICY,
  idempotencyKey,
  MIN_SECRET_BYTES,
  RECEIPT_SKEW_MS,
  RECEIPT_TTL_MS,
  receiptBoundsIssues,
  signReceipt,
  verifyReceipt,
  type RewardCandidate,
  type SettlementReceipt,
  type SignedReceipt,
} from "../src";
import { U1, U2, U3 } from "./helpers";

const SECRET = "test-secret-with-more-than-sixteen-bytes";
const NOW = 1_800_000_000_000;

const candidate = (userId: string, score: number): RewardCandidate => ({
  userId,
  score,
  correct: 6,
  answered: 8,
  correctElapsedMs: 40_000,
  flagged: false,
});

function receipt(now = NOW): SettlementReceipt {
  return buildReceipt({
    instanceId: "i-1234-gc-5678-9012",
    roundId: "lq3k9d2a-1",
    now,
    questionCount: 8,
    lines: computeRoundRewards([candidate(U1, 6000), candidate(U2, 5000), candidate(U3, 4000)], 8),
  });
}

async function signed(now = NOW): Promise<SignedReceipt> {
  return signReceipt(receipt(now), SECRET);
}

describe("buildReceipt", () => {
  test("carries the rules' outcome, the validity window and one idempotency key per member", () => {
    const r = receipt();
    expect(r.v).toBe(1);
    expect(r.game).toBe("quiz");
    expect(r.issuedAt).toBe(NOW);
    expect(r.expiresAt).toBe(NOW + RECEIPT_TTL_MS);
    expect(r.entries.map((e) => e.zeni)).toEqual([60, 40, 20]);
    expect(r.policy).toEqual({ podiumZeni: [60, 40, 20], perRoundCapZeni: 60 });
    for (const entry of r.entries)
      expect(entry.idempotencyKey).toBe(idempotencyKey(r.instanceId, r.roundId, entry.userId));
    expect(idempotencyKey("i-1", "r-1", U1)).toBe(`activity:i-1:r-1:${U1}`);
  });

  test("has no XP field anywhere", () => {
    const text = JSON.stringify(receipt()).toLowerCase();
    expect(text).not.toMatch(/"(xp|multiplier|boost|experience)[a-z]*"/);
    for (const entry of receipt().entries)
      expect(Object.keys(entry).toSorted()).toEqual([
        "answered",
        "correct",
        "idempotencyKey",
        "rank",
        "reason",
        "score",
        "userId",
        "zeni",
      ]);
  });

  test("refuses to build a receipt for an invalid instance, round or member", () => {
    expect(() =>
      buildReceipt({
        instanceId: "bad id",
        roundId: "lq3k9d2a-1",
        now: NOW,
        questionCount: 8,
        lines: [],
      }),
    ).toThrow();
    expect(() =>
      buildReceipt({ instanceId: "i-1", roundId: "ROUND", now: NOW, questionCount: 8, lines: [] }),
    ).toThrow();
  });
});

describe("canonicalJson", () => {
  test("is independent of key order, at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("keeps array order and refuses values that have no stable form", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalJson({ a: () => 1 })).toThrow(TypeError);
  });
});

describe("signReceipt", () => {
  test("produces a 64-hex HMAC-SHA256, the same one every time", async () => {
    const a = await signed();
    const b = await signed();
    expect(a.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(b.signature).toBe(a.signature);
  });

  test("depends on the secret and on every field", async () => {
    const base = await signed();
    const other = await signReceipt(receipt(), "another-secret-with-enough-bytes");
    expect(other.signature).not.toBe(base.signature);
    const moved = await signReceipt(receipt(NOW + 1), SECRET);
    expect(moved.signature).not.toBe(base.signature);
  });

  test("accepts a secret as bytes and rejects a short one", async () => {
    const asBytes = await signReceipt(receipt(), new TextEncoder().encode(SECRET));
    expect(asBytes.signature).toBe((await signed()).signature);
    await expect(signReceipt(receipt(), "short")).rejects.toThrow(RangeError);
    await expect(signReceipt(receipt(), new Uint8Array(MIN_SECRET_BYTES - 1))).rejects.toThrow(
      RangeError,
    );
    await expect(signReceipt(receipt(), "")).rejects.toThrow(RangeError);
  });

  test("only signs a well-formed receipt", async () => {
    const broken = { ...receipt(), entries: [] } as SettlementReceipt;
    await expect(signReceipt(broken, SECRET)).rejects.toThrow();
  });
});

describe("verifyReceipt", () => {
  test("accepts a fresh, intact receipt", async () => {
    const result = await verifyReceipt(await signed(), SECRET, { now: NOW + 5_000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.receipt.entries).toHaveLength(3);
  });

  test("survives a JSON round trip, as it travels over HTTP", async () => {
    const wire = JSON.parse(JSON.stringify(await signed()));
    expect((await verifyReceipt(wire, SECRET, { now: NOW })).ok).toBe(true);
  });

  test("rejects a wrong secret", async () => {
    const result = await verifyReceipt(await signed(), "another-secret-with-enough-bytes", {
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("rejects any tampering with the receipt", async () => {
    const good = await signed();
    const tampers: ((r: SettlementReceipt) => void)[] = [
      (r) => void (r.entries[2]!.zeni = 60),
      (r) => void (r.entries[0]!.zeni = 600),
      (r) => void (r.entries[1]!.userId = U3),
      (r) => void (r.entries[0]!.rank = 2),
      (r) => void (r.entries[0]!.score += 1),
      (r) => void (r.roundId = "lq3k9d2a-2"),
      (r) => void (r.instanceId = "i-other"),
      (r) => void (r.expiresAt += 60_000),
      (r) => void r.entries.pop(),
      (r) => void (r.entries = r.entries.toReversed()),
      (r) => void (r.policy.perRoundCapZeni = 600),
    ];
    for (const tamper of tampers) {
      const copy = structuredClone(good);
      tamper(copy.receipt);
      const result = await verifyReceipt(copy, SECRET, { now: NOW });
      expect(result.ok).toBe(false);
    }
  });

  test("rejects a forged or truncated signature", async () => {
    const good = await signed();
    const flipped = good.signature.slice(0, -1) + (good.signature.endsWith("0") ? "1" : "0");
    for (const signature of [
      flipped,
      "0".repeat(64),
      good.signature.toUpperCase(),
      good.signature.slice(2),
      "",
    ]) {
      const result = await verifyReceipt({ ...good, signature }, SECRET, { now: NOW });
      expect(result.ok).toBe(false);
    }
  });

  test("rejects a receipt with an XP field or any other extra key", async () => {
    const good = await signed();
    const withXp = structuredClone(good) as unknown as {
      receipt: { entries: Record<string, unknown>[] };
    };
    withXp.receipt.entries[0]!.xp = 1_000_000;
    expect(await verifyReceipt(withXp, SECRET, { now: NOW })).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    const topLevel = { ...good, multiplier: 100 };
    expect(await verifyReceipt(topLevel, SECRET, { now: NOW })).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    const inner = { ...good, receipt: { ...good.receipt, xp: 5 } };
    expect(await verifyReceipt(inner, SECRET, { now: NOW })).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  test("rejects malformed input without throwing", async () => {
    for (const input of [null, undefined, 42, "x", [], {}, { receipt: {}, signature: "00" }]) {
      expect(await verifyReceipt(input, SECRET, { now: NOW })).toMatchObject({
        ok: false,
        reason: "malformed",
      });
    }
  });

  test("validity window: expired, and not yet valid beyond the skew", async () => {
    const good = await signed();
    expect(await verifyReceipt(good, SECRET, { now: NOW + RECEIPT_TTL_MS })).toMatchObject({
      ok: true,
    });
    expect(await verifyReceipt(good, SECRET, { now: NOW + RECEIPT_TTL_MS + 1 })).toEqual({
      ok: false,
      reason: "expired",
    });
    // Issued slightly in the future (clock skew between hosts) is tolerated, far in the future is not.
    expect(await verifyReceipt(good, SECRET, { now: NOW - RECEIPT_SKEW_MS })).toMatchObject({
      ok: true,
    });
    expect(await verifyReceipt(good, SECRET, { now: NOW - RECEIPT_SKEW_MS - 1 })).toEqual({
      ok: false,
      reason: "not_yet_valid",
    });
  });

  test("the bot's own policy is the ceiling: a receipt cannot raise its caps", async () => {
    const strict = {
      ...DEFAULT_REWARD_POLICY,
      podiumZeni: [30, 20, 10],
      perRoundCapZeni: 30,
      dailyQuiz: { ...DEFAULT_REWARD_POLICY.dailyQuiz },
    };
    const result = await verifyReceipt(await signed(), SECRET, { now: NOW, policy: strict });
    expect(result).toMatchObject({ ok: false, reason: "out_of_bounds" });
  });

  test("a validly signed receipt that pays beyond the rules is still refused", async () => {
    // The secret holder (or a bug) signs an inflated receipt: the bounds catch it.
    const inflated = receipt();
    inflated.entries[0]!.zeni = 500;
    const result = await verifyReceipt(await signReceipt(inflated, SECRET), SECRET, { now: NOW });
    expect(result).toMatchObject({ ok: false, reason: "out_of_bounds" });
    const everyone = receipt();
    for (const entry of everyone.entries) entry.zeni = 60;
    expect(
      await verifyReceipt(await signReceipt(everyone, SECRET), SECRET, { now: NOW }),
    ).toMatchObject({
      ok: false,
      reason: "out_of_bounds",
    });
  });

  test("a short secret is a configuration error, not a verdict", async () => {
    await expect(verifyReceipt(await signed(), "short", { now: NOW })).rejects.toThrow(RangeError);
  });
});

describe("receiptBoundsIssues", () => {
  const issues = (edit: (r: SettlementReceipt) => void) => {
    const r = structuredClone(receipt());
    edit(r);
    return receiptBoundsIssues(r);
  };

  test("an honest receipt is within bounds", () => {
    expect(receiptBoundsIssues(receipt())).toEqual([]);
  });

  test("duplicate members, wrong idempotency keys, impossible counters", () => {
    expect(issues((r) => void (r.entries[1]!.userId = r.entries[0]!.userId))).not.toEqual([]);
    expect(issues((r) => void (r.entries[0]!.idempotencyKey = "activity:x:y:z"))).not.toEqual([]);
    expect(issues((r) => void (r.entries[0]!.answered = 99))).not.toEqual([]);
    expect(issues((r) => void (r.entries[0]!.correct = 9))).not.toEqual([]);
  });

  test("zeni without a podium reason, and an oversized window", () => {
    expect(
      issues((r) => {
        r.entries[0]!.reason = "off_podium";
      }),
    ).toContain(`entry ${U1} pays without a podium reason`);
    expect(issues((r) => void (r.expiresAt = r.issuedAt + RECEIPT_TTL_MS + 1))).toContain(
      "validity window out of range",
    );
    expect(issues((r) => void (r.expiresAt = r.issuedAt))).toContain(
      "validity window out of range",
    );
  });
});
