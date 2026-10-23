// SPDX-License-Identifier: Apache-2.0
/**
 * Settlement receipt: the signed statement of what a finished room round allows the bot to pay.
 *
 * The Activity never credits anything. At the end of a round the server signs a receipt
 * (HMAC-SHA256 under `SHENRON_ACTIVITY_SECRET`, a secret distinct from `API_USER_SECRET`) and sends
 * it to the bot (`POST /api/activity/settle`, lot A3). The bot verifies it with `verifyReceipt`,
 * which re-checks the signature, the validity window, the schema (strict: an `xp` field, or any
 * other extra key, makes the receipt malformed) and the bounds against the bot's own policy, then
 * applies the daily budget and the account checks and credits through its reward service with the
 * idempotency key of each entry.
 *
 * Web Crypto only (`crypto.subtle`), so the module stays runtime class `pure`. The secret is
 * injected; nothing here reads the environment.
 */
import { z } from "zod";
import { InstanceIdSchema, RoundIdSchema, UserIdSchema } from "../protocol";
import {
  DEFAULT_REWARD_POLICY,
  RULE_REWARD_REASONS,
  type RewardLine,
  type RewardPolicy,
} from "./rewards";

export const RECEIPT_VERSION = 1 as const;
/** A receipt can be settled for this long after it was issued. */
export const RECEIPT_TTL_MS = 15 * 60_000;
/** Clock skew tolerated between the Activity server and the bot. */
export const RECEIPT_SKEW_MS = 2 * 60_000;
/** Shortest secret accepted (bytes). */
export const MIN_SECRET_BYTES = 16;

export const ReceiptEntrySchema = z.strictObject({
  userId: UserIdSchema,
  rank: z.number().int().min(1),
  score: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  /** Zeni the rules allow for this member in this round. There is no XP field, on purpose. */
  zeni: z.number().int().min(0).max(10_000),
  reason: z.enum(RULE_REWARD_REASONS),
  /** `activity:<instanceId>:<roundId>:<userId>`: the bot refuses to pay one key twice. */
  idempotencyKey: z.string().max(220),
});
export type ReceiptEntry = z.infer<typeof ReceiptEntrySchema>;

export const SettlementReceiptSchema = z.strictObject({
  v: z.literal(RECEIPT_VERSION),
  game: z.literal("quiz"),
  mode: z.literal("room"),
  instanceId: InstanceIdSchema,
  roundId: RoundIdSchema,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  questionCount: z.number().int().min(1).max(50),
  /** The caps the Activity computed under; the bot refuses a receipt that claims more than its own. */
  policy: z.strictObject({
    podiumZeni: z.array(z.number().int().nonnegative()).min(1).max(10),
    perRoundCapZeni: z.number().int().nonnegative(),
  }),
  entries: z.array(ReceiptEntrySchema).min(1).max(100),
});
export type SettlementReceipt = z.infer<typeof SettlementReceiptSchema>;

export const SignedReceiptSchema = z.strictObject({
  receipt: SettlementReceiptSchema,
  /** Lower-case hex HMAC-SHA256 of the canonical JSON of `receipt`. */
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});
export type SignedReceipt = z.infer<typeof SignedReceiptSchema>;

export function idempotencyKey(instanceId: string, roundId: string, userId: string): string {
  return `activity:${instanceId}:${roundId}:${userId}`;
}

export interface BuildReceiptInput {
  readonly instanceId: string;
  readonly roundId: string;
  readonly now: number;
  readonly questionCount: number;
  readonly lines: readonly RewardLine[];
  readonly policy?: RewardPolicy;
}

/** Turns the reward lines of a finished round into an (unsigned) receipt. */
export function buildReceipt(input: BuildReceiptInput): SettlementReceipt {
  const policy = input.policy ?? DEFAULT_REWARD_POLICY;
  return SettlementReceiptSchema.parse({
    v: RECEIPT_VERSION,
    game: "quiz",
    mode: "room",
    instanceId: input.instanceId,
    roundId: input.roundId,
    issuedAt: input.now,
    expiresAt: input.now + RECEIPT_TTL_MS,
    questionCount: input.questionCount,
    policy: { podiumZeni: [...policy.podiumZeni], perRoundCapZeni: policy.perRoundCapZeni },
    entries: input.lines.map((line) => ({
      userId: line.userId,
      rank: line.rank,
      score: line.score,
      correct: line.correct,
      answered: line.answered,
      zeni: line.zeni,
      reason: line.reason,
      idempotencyKey: idempotencyKey(input.instanceId, input.roundId, line.userId),
    })),
  });
}

// ── Canonical form and HMAC ──────────────────────────────────────────────────

/** JSON with object keys sorted at every level: the same receipt always gives the same bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new TypeError("canonicalJson: non-finite number");
    if (value === undefined || typeof value === "function" || typeof value === "symbol")
      throw new TypeError("canonicalJson: unsupported value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const body = Object.keys(record)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${body.join(",")}}`;
}

const encoder = new TextEncoder();

function secretBytes(secret: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = typeof secret === "string" ? encoder.encode(secret) : Uint8Array.from(secret);
  if (bytes.length < MIN_SECRET_BYTES)
    throw new RangeError(`the activity secret must be at least ${MIN_SECRET_BYTES} bytes`);
  return bytes;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hmacKey(secret: string | Uint8Array, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secretBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/** Signs a receipt. The receipt is validated first: only a well-formed receipt is ever signed. */
export async function signReceipt(
  receipt: SettlementReceipt,
  secret: string | Uint8Array,
): Promise<SignedReceipt> {
  const valid = SettlementReceiptSchema.parse(receipt);
  const key = await hmacKey(secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(canonicalJson(valid)));
  return { receipt: valid, signature: toHex(mac) };
}

export type ReceiptFailure =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "not_yet_valid"
  | "out_of_bounds";

export type VerifyResult =
  | { readonly ok: true; readonly receipt: SettlementReceipt }
  | { readonly ok: false; readonly reason: ReceiptFailure; readonly detail?: string };

/**
 * Issues of a receipt against a policy (empty: within bounds). The bot passes its own policy, so a
 * receipt cannot raise a cap by carrying a larger one.
 */
export function receiptBoundsIssues(
  receipt: SettlementReceipt,
  policy: RewardPolicy = DEFAULT_REWARD_POLICY,
): string[] {
  const issues: string[] = [];
  if (
    receipt.expiresAt <= receipt.issuedAt ||
    receipt.expiresAt - receipt.issuedAt > RECEIPT_TTL_MS
  )
    issues.push("validity window out of range");
  if (receipt.policy.perRoundCapZeni > policy.perRoundCapZeni)
    issues.push("receipt claims a per-round cap above the policy");
  receipt.policy.podiumZeni.forEach((amount, place) => {
    if (amount > (policy.podiumZeni[place] ?? 0))
      issues.push(`podium place ${place + 1} above the policy`);
  });
  const podiumTotal = policy.podiumZeni.reduce((sum, amount) => sum + amount, 0);
  const seen = new Set<string>();
  let total = 0;
  for (const entry of receipt.entries) {
    if (seen.has(entry.userId)) issues.push(`duplicate entry for ${entry.userId}`);
    seen.add(entry.userId);
    if (entry.idempotencyKey !== idempotencyKey(receipt.instanceId, receipt.roundId, entry.userId))
      issues.push(`idempotency key mismatch for ${entry.userId}`);
    if (entry.zeni > policy.perRoundCapZeni)
      issues.push(`entry ${entry.userId} above the per-round cap`);
    if (entry.zeni > 0 && entry.reason !== "podium" && entry.reason !== "tied_podium")
      issues.push(`entry ${entry.userId} pays without a podium reason`);
    if (entry.answered > receipt.questionCount || entry.correct > entry.answered)
      issues.push(`entry ${entry.userId} has impossible counters`);
    total += entry.zeni;
  }
  if (total > podiumTotal) issues.push("total above the podium");
  return issues;
}

export interface VerifyOptions {
  /** Current time (ms); the bot passes its own clock. */
  readonly now: number;
  /** The bot's policy; default: the shipped one. */
  readonly policy?: RewardPolicy;
  readonly skewMs?: number;
}

/**
 * Verifies a received receipt: schema, then signature (constant-time), then validity window, then
 * bounds. Never throws on bad input; a secret that is too short throws, as that is a configuration
 * error.
 */
export async function verifyReceipt(
  input: unknown,
  secret: string | Uint8Array,
  options: VerifyOptions,
): Promise<VerifyResult> {
  const parsed = SignedReceiptSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "malformed", detail: parsed.error.issues[0]?.message };
  const { receipt, signature } = parsed.data;
  const key = await hmacKey(secret, "verify");
  const mac = fromHex(signature);
  const valid =
    mac !== null &&
    (await crypto.subtle.verify("HMAC", key, mac, encoder.encode(canonicalJson(receipt))));
  if (!valid) return { ok: false, reason: "bad_signature" };
  const skew = options.skewMs ?? RECEIPT_SKEW_MS;
  if (options.now > receipt.expiresAt) return { ok: false, reason: "expired" };
  if (receipt.issuedAt > options.now + skew) return { ok: false, reason: "not_yet_valid" };
  const issues = receiptBoundsIssues(receipt, options.policy);
  if (issues.length > 0) return { ok: false, reason: "out_of_bounds", detail: issues[0] };
  return { ok: true, receipt };
}
