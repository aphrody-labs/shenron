// SPDX-License-Identifier: Apache-2.0
/**
 * Service routes between the Arène Shenron Activity server and the bot
 * (docs/products/bot-discord-refonte.md §7.2, lot A3). Runtime class: `pure`.
 *
 * The Activity never credits anything: at the end of a round it signs a settlement receipt
 * (`@aphrody/shenron-activity/quiz`, HMAC-SHA256 under `SHENRON_ACTIVITY_SECRET`) and posts it to
 * `POST /api/activity/settle`. The bot verifies the signature, the validity window and its own
 * caps, refuses a receipt it already settled, applies the daily budget and the account checks, and
 * credits through its economy service. The response says what was really paid, so the Activity can
 * show it.
 *
 * Both routes are bot-owned service routes (they stay out of the public OpenAPI document) behind a
 * bearer token: `SHENRON_ACTIVITY_TOKEN`, or the admin token (503 when none is configured).
 *
 * The request shape below mirrors `SignedReceiptSchema` of `@aphrody/shenron-activity/quiz`, which
 * stays the validator of record (the bot hands the raw body to `verifyReceipt`); a bot test keeps
 * the two in step. This package cannot depend on the private activity package.
 */
import { z } from "zod";

export const ACTIVITY_PATHS = {
  settle: "/api/activity/settle",
  budget: "/api/activity/budget/{userId}",
} as const;

/** Discord user id (snowflake), as the activity protocol writes it. */
const UserId = z.string().regex(/^\d{5,25}$/);
const InstanceId = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const RoundId = z.string().regex(/^[a-z0-9]{1,12}-\d{1,4}$/);

/**
 * Why a member got what they got. The first group is decided by the Activity rules, the second by
 * the bot when it settles. Mirrors `REWARD_REASONS` of `@aphrody/shenron-activity/protocol`.
 */
export const ActivityRewardReason = z
  .enum([
    "podium",
    "tied_podium",
    "off_podium",
    "solo",
    "inactive",
    "no_points",
    "flagged",
    "daily_budget",
    "account_ineligible",
    "kill_switch",
    "duplicate",
  ])
  .meta({ id: "ActivityRewardReason" });
export type ActivityRewardReason = z.infer<typeof ActivityRewardReason>;

const ReceiptEntry = z.strictObject({
  userId: UserId,
  rank: z.number().int().min(1),
  score: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  /** Zeni the rules allow for this member in this round. There is no XP field, on purpose. */
  zeni: z.number().int().min(0).max(10_000),
  reason: ActivityRewardReason,
  /** `activity:<instanceId>:<roundId>:<userId>`: the bot never pays one key twice. */
  idempotencyKey: z.string().max(220),
});

/** `POST /api/activity/settle`: the signed receipt, exactly as `signReceipt` returns it. */
export const ActivitySettleBody = z
  .strictObject({
    receipt: z.strictObject({
      v: z.literal(1),
      game: z.literal("quiz"),
      mode: z.literal("room"),
      instanceId: InstanceId,
      roundId: RoundId,
      issuedAt: z.number().int().nonnegative(),
      expiresAt: z.number().int().nonnegative(),
      questionCount: z.number().int().min(1).max(50),
      /** The caps the Activity computed under; the bot refuses a receipt that claims more than its own. */
      policy: z.strictObject({
        podiumZeni: z.array(z.number().int().nonnegative()).min(1).max(10),
        perRoundCapZeni: z.number().int().nonnegative(),
      }),
      entries: z.array(ReceiptEntry).min(1).max(100),
    }),
    /** Lower-case hex HMAC-SHA256 of the canonical JSON of `receipt`. */
    signature: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .meta({ id: "ActivitySettleBody" });
export type ActivitySettleBody = z.infer<typeof ActivitySettleBody>;

/** Largest accepted request body (100 entries of about 350 bytes, with room to spare). */
export const ACTIVITY_SETTLE_MAX_BODY_BYTES = 64 * 1024;

/** How the bot answers a receipt it refuses: HTTP status and `error` of the error envelope. */
export const ACTIVITY_SETTLE_FAILURES = {
  malformed: { status: 400, error: "invalid_receipt" },
  not_yet_valid: { status: 400, error: "receipt_not_yet_valid" },
  bad_signature: { status: 403, error: "bad_signature" },
  expired: { status: 410, error: "receipt_expired" },
  out_of_bounds: { status: 422, error: "receipt_out_of_bounds" },
} as const;

/** What happened to one member of a receipt. */
export const ActivitySettleEntry = z.object({
  userId: UserId,
  idempotencyKey: z.string(),
  /** `duplicate`: the key was settled before; the amounts are the ones paid then, nothing is paid again. */
  status: z.enum(["settled", "duplicate"]),
  /** Zeni the receipt asked for. */
  requested: z.number().int().nonnegative(),
  /** Zeni really credited (after the daily budget and the account checks). */
  granted: z.number().int().nonnegative(),
  /** Why the member got less than `requested` (or the rule reason when they got all of it). */
  reason: ActivityRewardReason,
  /** XP of the game credited by the level system (never multiplied, capped over 24 hours). */
  xp: z.number().int().nonnegative(),
  xpCapped: z.boolean(),
  levelUp: z.boolean(),
  newLevel: z.number().int().nonnegative().nullable(),
  /** What is left of the member's daily game budget once this entry is settled. */
  budgetLeft: z.number().int().nonnegative(),
});
export type ActivitySettleEntry = z.infer<typeof ActivitySettleEntry>;

export const ActivitySettleResponse = z
  .object({
    ok: z.literal(true),
    instanceId: z.string(),
    roundId: z.string(),
    /** Every entry had been settled before: this call paid nothing. */
    replayed: z.boolean(),
    /** Zeni credited by THIS call (entries already settled earlier add nothing). */
    totalGranted: z.number().int().nonnegative(),
    /** XP credited by this call, on the same terms. */
    totalXp: z.number().int().nonnegative(),
    entries: z.array(ActivitySettleEntry),
  })
  .meta({ id: "ActivitySettleResponse" });
export type ActivitySettleResponse = z.infer<typeof ActivitySettleResponse>;

/** `{userId}` of `GET /api/activity/budget/{userId}`. */
export const ActivityBudgetParams = z.object({ userId: UserId });

/** Remaining daily game budget of a member (all games, zeni, last 24 hours). */
export const ActivityBudgetResponse = z
  .object({
    userId: UserId,
    dailyBudget: z.number().int().nonnegative(),
    spent: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    windowHours: z.literal(24),
    /** `false`: the member would not be paid (young account, low level, frozen gains, kill switch). */
    eligible: z.boolean(),
    reason: z.enum(["account_ineligible", "kill_switch"]).nullable(),
  })
  .meta({ id: "ActivityBudgetResponse" });
export type ActivityBudgetResponse = z.infer<typeof ActivityBudgetResponse>;
