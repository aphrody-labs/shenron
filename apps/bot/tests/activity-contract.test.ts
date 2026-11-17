// SPDX-License-Identifier: Apache-2.0
/**
 * The contract in `@aphrody/shenron-api/contract` documents the settlement request; the validator
 * of record is `@aphrody/shenron-activity/quiz`. This keeps the two in step (the contract package
 * cannot depend on the private activity package), and checks the bot's route declarations.
 */
import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import {
  buildReceipt,
  signReceipt,
  SignedReceiptSchema,
  type RewardLine,
} from "@aphrody/shenron-activity/quiz";
import { REWARD_REASONS } from "@aphrody/shenron-activity/protocol";
import {
  ACTIVITY_SETTLE_FAILURES,
  ActivityRewardReason,
  ActivitySettleBody,
  endpoints,
} from "@aphrody/shenron-api/contract";

const lines: RewardLine[] = [
  {
    userId: "910000000000000001",
    rank: 1,
    score: 900,
    correct: 5,
    answered: 5,
    zeni: 60,
    reason: "podium",
  },
  {
    userId: "910000000000000002",
    rank: 2,
    score: 700,
    correct: 4,
    answered: 5,
    zeni: 40,
    reason: "podium",
  },
  {
    userId: "910000000000000003",
    rank: 3,
    score: 0,
    correct: 0,
    answered: 0,
    zeni: 0,
    reason: "inactive",
  },
];

describe("settlement contract versus the activity package", () => {
  test("a receipt the package signs satisfies the contract body, and the reverse", async () => {
    const signed = await signReceipt(
      buildReceipt({
        instanceId: "inst-1",
        roundId: "k1-1",
        now: 1_800_000_000_000,
        questionCount: 5,
        lines,
      }),
      "test-activity-secret-0123456789abcdef",
    );
    expect(SignedReceiptSchema.safeParse(signed).success).toBe(true);
    expect(ActivitySettleBody.safeParse(signed).success).toBe(true);
  });

  test("both reject the same malformed receipts (extra key, XP field, bad signature)", async () => {
    const signed = await signReceipt(
      buildReceipt({
        instanceId: "inst-1",
        roundId: "k1-2",
        now: 1_800_000_000_000,
        questionCount: 5,
        lines,
      }),
      "test-activity-secret-0123456789abcdef",
    );
    const withXp = structuredClone(signed) as unknown as {
      receipt: { entries: Record<string, unknown>[] };
    };
    withXp.receipt.entries[0]!.xp = 10;
    const variants: unknown[] = [
      withXp,
      { ...signed, extra: 1 },
      { ...signed, signature: "ABC" },
      { receipt: { ...signed.receipt, game: "duel" }, signature: signed.signature },
      { receipt: { ...signed.receipt, entries: [] }, signature: signed.signature },
      { receipt: { ...signed.receipt, v: 2 }, signature: signed.signature },
    ];
    for (const variant of variants) {
      expect(ActivitySettleBody.safeParse(variant).success).toBe(
        SignedReceiptSchema.safeParse(variant).success,
      );
      expect(SignedReceiptSchema.safeParse(variant).success).toBe(false);
    }
  });

  test("the contract lists the reward reasons of the protocol, in the same order", () => {
    expect(ActivityRewardReason.options).toEqual([...REWARD_REASONS]);
  });

  test("every failure of verifyReceipt has an HTTP answer", () => {
    expect(Object.keys(ACTIVITY_SETTLE_FAILURES).toSorted()).toEqual(
      ["bad_signature", "expired", "malformed", "not_yet_valid", "out_of_bounds"].toSorted(),
    );
  });
});

describe("endpoint declarations", () => {
  test("both routes are bot-owned, bearer-protected and never cached", () => {
    for (const spec of [endpoints.activitySettle, endpoints.activityBudget]) {
      expect(spec.auth).toBe("admin");
      expect(spec.cache).toBe("no-store");
      expect("native" in spec).toBe(false);
    }
    expect(endpoints.activitySettle.method).toBe("post");
    expect(endpoints.activitySettle.path).toBe("/api/activity/settle");
    expect(endpoints.activityBudget.method).toBe("get");
    expect(endpoints.activityBudget.path).toBe("/api/activity/budget/{userId}");
  });
});
