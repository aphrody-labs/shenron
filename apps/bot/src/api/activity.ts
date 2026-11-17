// SPDX-License-Identifier: Apache-2.0
/**
 * Settlement of the Arène Shenron Activity rounds (docs/products/bot-discord-refonte.md §7.2, lot A3).
 *
 *   POST /api/activity/settle           the signed receipt of a finished round -> what was paid
 *   GET  /api/activity/budget/:userId   the daily game budget left to a member
 *
 * The Activity server never credits anything. It signs a receipt (`signReceipt`, HMAC-SHA256 under
 * `SHENRON_ACTIVITY_SECRET`) and the bot disposes:
 *
 *  1. bearer token (`SHENRON_ACTIVITY_TOKEN` or the admin token): these routes are never public;
 *  2. `verifyReceipt`: schema, signature, validity window and the bot's own caps;
 *  3. one row of `activity_settlements` per `activity:<instanceId>:<roundId>:<userId>` key, written
 *     BEFORE anything is paid. The primary key is the replay guard: a receipt posted twice finds its
 *     rows, pays nothing again and answers with what was paid the first time;
 *  4. per member: kill switch, account age, level (zeni only), then the common daily budget
 *     (`activity.daily_budget`, counted in `action_logs`, `kind: "game"`), then the credit through
 *     `EconomyService.creditZeni` (journal, freeze and anti-cheat; source `activity`, no race
 *     multiplier, no fusion share), then the game XP through the level system, never multiplied
 *     (`grantGameXp`, behind a port);
 *  5. a `ACTIVITY_SETTLED` line in `action_logs` and the detail credited in the response.
 *
 * Entries are settled one after the other under a process-wide lock, so two receipts for the same
 * member cannot both read the same budget. Dependencies are injected: tests run without Discord.
 */
import { timingSafeEqualString } from "@aphrody/shenron-auth/crypto";
import { ACTIVITY_ENV, envString } from "@aphrody/shenron-config/env";
import {
  ACTIVITY_SETTLE_FAILURES,
  ACTIVITY_SETTLE_MAX_BODY_BYTES,
  ActivityBudgetParams,
  type ActivityBudgetResponse,
  type ActivityRewardReason,
  type ActivitySettleEntry,
  type ActivitySettleResponse,
  type ErrorEnvelope,
} from "@aphrody/shenron-api/contract";
import {
  DEFAULT_REWARD_POLICY,
  HARD_LIMITS,
  MIN_SECRET_BYTES,
  verifyReceipt,
  type ReceiptEntry,
  type SettlementReceipt,
} from "@aphrody/shenron-activity/quiz";
import { and, eq, gte, like } from "drizzle-orm";
import type { GuildMember } from "discord.js";
import { container } from "tsyringe";
import { resolveMember } from "~/api/guild-member";
import { DatabaseService } from "~/db/index";
import { actionLogs, activitySettlements, users } from "~/db/schema";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { levelForXP } from "~/lib/xp";
import { EconomyService } from "~/services/EconomyService";
import { GameRewardService } from "~/services/GameRewardService";
import { SettingsService } from "~/services/SettingsService";

const DAY_MS = 86_400_000;
/** Discord snowflake epoch (2015-01-01T00:00:00Z). */
const DISCORD_EPOCH_MS = 1_420_070_400_000;

/** Game name written in the ledger and handed to the XP service, per receipt game. */
const gameName = (game: string): string => `arena-${game}`;

// ── Ports ────────────────────────────────────────────────────────────────────

/** XP a finished Activity round gives a member (`GameRewardService.grantGameXp`). */
export interface ActivityXpInput {
  userId: string;
  /** `podium`: a place on the podium; `play`: took part in a real round. */
  outcome: "podium" | "play";
  game: string;
  /** For the level-up role and announcement; absent when the member left the server. */
  member?: GuildMember;
}

export interface ActivityXpResult {
  xp: number;
  capped: boolean;
  levelUp: boolean;
  newLevel?: number;
}

export interface ActivityXpPort {
  grantGameXp(input: ActivityXpInput): Promise<ActivityXpResult>;
}

export interface ActivityDeps {
  now(): number;
  /** HMAC secret of the receipts, `undefined` when not configured. */
  secret(): string | undefined;
  /** Accepted bearer tokens (empty: the routes are disabled). */
  tokens(): readonly string[];
  settings: Pick<SettingsService, "getInt" | "getBool">;
  db: Pick<DatabaseService, "db">;
  economy: Pick<EconomyService, "creditZeni">;
  /** `null` when the XP service has no `grantGameXp` yet: settlement then pays zeni only. */
  xp(): ActivityXpPort | null;
  resolveMember(userId: string): Promise<GuildMember | null>;
}

/**
 * Production wiring, resolved lazily so the routes can be built before the container is ready.
 * `GameRewardService.grantGameXp` is looked up at call time: until it exists the settlement pays
 * zeni only, and it starts giving XP the moment the method lands, with no change here.
 */
export function defaultActivityDeps(): ActivityDeps {
  return {
    now: () => Date.now(),
    secret: () => envString(Bun.env, ACTIVITY_ENV.secret),
    tokens: () =>
      [envString(Bun.env, ACTIVITY_ENV.token), env.API_ADMIN_TOKEN].filter(
        (token): token is string => typeof token === "string" && token.length > 0,
      ),
    get settings() {
      return container.resolve(SettingsService);
    },
    get db() {
      return container.resolve(DatabaseService);
    },
    get economy() {
      return container.resolve(EconomyService);
    },
    xp: () => {
      const service = container.resolve(GameRewardService) as unknown as Partial<ActivityXpPort>;
      return typeof service.grantGameXp === "function"
        ? { grantGameXp: (input) => service.grantGameXp!(input) }
        : null;
    },
    resolveMember: (userId) => resolveMember(userId),
  };
}

// ── Responses ────────────────────────────────────────────────────────────────

const NO_STORE = { "cache-control": "private, no-store" } as const;

function fail(
  status: number,
  error: string,
  code?: ErrorEnvelope["code"],
  message?: string,
): Response {
  const body: ErrorEnvelope = { error, ...(code ? { code } : {}), ...(message ? { message } : {}) };
  return Response.json(body, { status, headers: NO_STORE });
}

function ok(body: ActivitySettleResponse | ActivityBudgetResponse): Response {
  return Response.json(body, { headers: NO_STORE });
}

/** Bearer check; `null` when the caller may go on. 503 without any configured token. */
function denyUnlessService(deps: ActivityDeps, req: Request): Response | null {
  const tokens = deps.tokens();
  if (tokens.length === 0)
    return fail(503, "not_configured", "internal", "no activity or admin token configured");
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Compare against every token, without stopping early.
  let matched = false;
  for (const token of tokens) if (timingSafeEqualString(presented, token)) matched = true;
  return matched && presented.length > 0 ? null : fail(401, "unauthenticated", "unauthenticated");
}

// ── Policy read from the settings ────────────────────────────────────────────

interface SettlementPolicy {
  enabled: boolean;
  dailyBudget: number;
  minAccountDays: number;
  minLevel: number;
}

async function readPolicy(deps: ActivityDeps): Promise<SettlementPolicy> {
  const [enabled, budget, minAccountDays, minLevel] = await Promise.all([
    deps.settings.getBool("features.games.arena", true),
    deps.settings.getInt("activity.daily_budget", DEFAULT_REWARD_POLICY.dailyBudgetZeni),
    deps.settings.getInt("activity.min_account_days", 7),
    deps.settings.getInt("activity.min_level", 2),
  ]);
  return {
    enabled,
    // A typo in the settings can lower the budget, never raise it past the hard limit.
    dailyBudget: Math.min(HARD_LIMITS.dailyBudgetZeni, Math.max(0, budget)),
    minAccountDays: Math.max(0, minAccountDays),
    minLevel: Math.max(0, minLevel),
  };
}

/** Age of a Discord account in days, read from its snowflake (no network). */
export function accountAgeDays(userId: string, now: number): number {
  try {
    const createdAt = Number(BigInt(userId) >> 22n) + DISCORD_EPOCH_MS;
    return Math.max(0, (now - createdAt) / DAY_MS);
  } catch {
    return 0;
  }
}

interface Standing {
  /** Too young an account: no gain at all (zeni nor XP). */
  young: boolean;
  /** Level below the minimum: no zeni (XP stays open so the member can level up). */
  lowLevel: boolean;
  frozen: boolean;
}

async function standingOf(
  deps: ActivityDeps,
  policy: SettlementPolicy,
  userId: string,
  now: number,
): Promise<Standing> {
  const row = await deps.db.db
    .select({ xp: users.xp, frozen: users.zeniFrozen })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return {
    young: accountAgeDays(userId, now) < policy.minAccountDays,
    lowLevel: levelForXP(row?.xp ?? 0) < policy.minLevel,
    frozen: row?.frozen ?? false,
  };
}

/** Zeni a member received from games over the last 24 hours (`action_logs`, `kind: "game"`). */
export async function gameZeniLastDay(
  deps: Pick<ActivityDeps, "db">,
  userId: string,
  now: number,
): Promise<number> {
  const rows = await deps.db.db
    .select({ meta: actionLogs.meta })
    .from(actionLogs)
    .where(
      and(
        eq(actionLogs.userId, userId),
        eq(actionLogs.action, "ZENI_GAIN"),
        like(actionLogs.meta, '%"kind":"game"%'),
        gte(actionLogs.createdAt, new Date(now - DAY_MS)),
      ),
    );
  let total = 0;
  for (const { meta } of rows) {
    try {
      const amount = Number((JSON.parse(meta ?? "{}") as { amount?: unknown }).amount);
      if (Number.isFinite(amount) && amount > 0) total += Math.trunc(amount);
    } catch {
      // A row without readable meta counts for nothing.
    }
  }
  return total;
}

// ── Serialisation ────────────────────────────────────────────────────────────

/** Runs tasks one after the other: a settlement reads the budget, then pays, without interleaving. */
class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

const settlementQueue = new SerialQueue();

// ── Settlement ───────────────────────────────────────────────────────────────

function xpOutcome(entry: ReceiptEntry): ActivityXpInput["outcome"] | null {
  // Only a real, multi-player round gives XP: `solo`, `inactive`, `no_points` and `flagged` do not.
  if (entry.reason === "podium" || entry.reason === "tied_podium") return "podium";
  if (entry.reason === "off_podium") return "play";
  return null;
}

async function settleEntry(
  deps: ActivityDeps,
  policy: SettlementPolicy,
  receipt: SettlementReceipt,
  entry: ReceiptEntry,
  now: number,
): Promise<ActivitySettleEntry> {
  const { db } = deps.db;
  const key = entry.idempotencyKey;
  const spentBefore = await gameZeniLastDay(deps, entry.userId, now);

  // Claim the key first: from here on a replay finds the row and pays nothing.
  const claimed = await db
    .insert(activitySettlements)
    .values({
      idempotencyKey: key,
      instanceId: receipt.instanceId,
      roundId: receipt.roundId,
      userId: entry.userId,
      game: gameName(receipt.game),
      rank: entry.rank,
      requested: entry.zeni,
      reason: entry.reason,
    })
    .onConflictDoNothing()
    .returning({ key: activitySettlements.idempotencyKey });
  if (claimed.length === 0) {
    const stored = await db
      .select()
      .from(activitySettlements)
      .where(eq(activitySettlements.idempotencyKey, key))
      .get();
    return {
      userId: entry.userId,
      idempotencyKey: key,
      status: "duplicate",
      requested: stored?.requested ?? entry.zeni,
      granted: stored?.granted ?? 0,
      reason: (stored?.reason as ActivityRewardReason | undefined) ?? "duplicate",
      xp: stored?.xp ?? 0,
      xpCapped: false,
      levelUp: false,
      newLevel: null,
      budgetLeft: Math.max(0, policy.dailyBudget - spentBefore),
    };
  }

  let granted = 0;
  let reason: ActivityRewardReason = entry.reason;
  let xp: ActivityXpResult = { xp: 0, capped: false, levelUp: false };
  try {
    if (!policy.enabled) {
      reason = "kill_switch";
    } else {
      const standing = await standingOf(deps, policy, entry.userId, now);
      if (standing.young) {
        reason = "account_ineligible";
      } else {
        if (entry.zeni > 0) {
          const left = Math.max(0, policy.dailyBudget - spentBefore);
          const amount = Math.min(entry.zeni, left);
          if (standing.lowLevel || standing.frozen) {
            reason = "account_ineligible";
          } else if (amount === 0) {
            reason = "daily_budget";
          } else {
            // Journal, freeze and anti-cheat all live in `creditZeni`. A game gain: no race
            // multiplier (games create no multiplier) and no fusion share.
            const paid = await deps.economy.creditZeni(entry.userId, amount, {
              kind: "game",
              source: "activity",
              applyRace: false,
              propagateFusion: false,
            });
            granted = paid.credited;
            if (granted === 0) reason = "account_ineligible";
            else if (granted < entry.zeni) reason = "daily_budget";
          }
        }
        const outcome = xpOutcome(entry);
        const port = outcome ? deps.xp() : null;
        if (outcome && port) {
          try {
            const member = (await deps.resolveMember(entry.userId).catch(() => null)) ?? undefined;
            xp = await port.grantGameXp({
              userId: entry.userId,
              outcome,
              game: gameName(receipt.game),
              member,
            });
          } catch (err) {
            // The zeni are already paid and recorded: a failing XP service never undoes them.
            logger.warn({ err, userId: entry.userId, key }, "activity: game XP not credited");
          }
        }
      }
    }
  } catch (err) {
    // Nothing was credited by this attempt: release the claim so a retry can settle the entry.
    await db.delete(activitySettlements).where(eq(activitySettlements.idempotencyKey, key));
    throw err;
  }

  await db
    .update(activitySettlements)
    .set({ granted, xp: xp.xp, reason, status: "settled", settledAt: new Date(deps.now()) })
    .where(eq(activitySettlements.idempotencyKey, key));

  return {
    userId: entry.userId,
    idempotencyKey: key,
    status: "settled",
    requested: entry.zeni,
    granted,
    reason,
    xp: xp.xp,
    xpCapped: xp.capped,
    levelUp: xp.levelUp,
    newLevel: xp.newLevel ?? null,
    budgetLeft: Math.max(0, policy.dailyBudget - spentBefore - granted),
  };
}

/** Settles a verified receipt entry by entry. Exported for tests; the route calls it under the lock. */
export async function settleReceipt(
  deps: ActivityDeps,
  receipt: SettlementReceipt,
): Promise<ActivitySettleResponse> {
  const policy = await readPolicy(deps);
  const now = deps.now();
  const entries: ActivitySettleEntry[] = [];
  for (const entry of receipt.entries) {
    entries.push(await settleEntry(deps, policy, receipt, entry, now));
  }
  // What THIS call paid: an entry settled earlier (`duplicate`) pays nothing again.
  const paidNow = entries.filter((e) => e.status === "settled");
  const totalGranted = paidNow.reduce((sum, e) => sum + e.granted, 0);
  const totalXp = paidNow.reduce((sum, e) => sum + e.xp, 0);
  const replayed = entries.every((e) => e.status === "duplicate");
  if (!replayed) {
    try {
      await deps.db.db.insert(actionLogs).values({
        action: "ACTIVITY_SETTLED",
        reason: `${receipt.instanceId}:${receipt.roundId}`,
        meta: JSON.stringify({
          game: receipt.game,
          players: entries.length,
          paid: paidNow.filter((e) => e.granted > 0).length,
          totalGranted,
          totalXp,
          reasons: Object.fromEntries(entries.map((e) => [e.userId, e.reason])),
        }),
      });
    } catch (err) {
      logger.error({ err, roundId: receipt.roundId }, "activity: settlement journal not written");
    }
  }
  logger.info(
    { instanceId: receipt.instanceId, roundId: receipt.roundId, totalGranted, totalXp, replayed },
    "activity: round settled",
  );
  return {
    ok: true,
    instanceId: receipt.instanceId,
    roundId: receipt.roundId,
    replayed,
    totalGranted,
    totalXp,
    entries,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** Reads a body of at most `limit` bytes; `null` when it is larger. */
async function readBounded(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  const text = await req.text();
  return new TextEncoder().encode(text).length > limit ? null : text;
}

async function handleSettle(deps: ActivityDeps, req: Request): Promise<Response> {
  const denied = denyUnlessService(deps, req);
  if (denied) return denied;
  const secret = deps.secret();
  if (!secret || new TextEncoder().encode(secret).length < MIN_SECRET_BYTES)
    return fail(
      503,
      "not_configured",
      "internal",
      `${ACTIVITY_ENV.secret} is missing or too short`,
    );

  const raw = await readBounded(req, ACTIVITY_SETTLE_MAX_BODY_BYTES);
  if (raw === null) return fail(413, "body_too_large", "invalid_request");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, ACTIVITY_SETTLE_FAILURES.malformed.error, "invalid_request", "invalid JSON");
  }

  const verified = await verifyReceipt(body, secret, {
    now: deps.now(),
    policy: DEFAULT_REWARD_POLICY,
  });
  if (!verified.ok) {
    const failure = ACTIVITY_SETTLE_FAILURES[verified.reason];
    logger.warn({ reason: verified.reason, detail: verified.detail }, "activity: receipt refused");
    return fail(
      failure.status,
      failure.error,
      verified.reason === "bad_signature" ? "forbidden" : "invalid_request",
      verified.detail,
    );
  }
  try {
    return ok(await settlementQueue.run(() => settleReceipt(deps, verified.receipt)));
  } catch (err) {
    logger.error({ err, roundId: verified.receipt.roundId }, "activity: settlement failed");
    return fail(500, "settlement_failed", "internal");
  }
}

async function handleBudget(
  deps: ActivityDeps,
  req: Request & { params?: Record<string, string> },
): Promise<Response> {
  const denied = denyUnlessService(deps, req);
  if (denied) return denied;
  const parsed = ActivityBudgetParams.safeParse({ userId: req.params?.userId });
  if (!parsed.success) return fail(400, "invalid_user_id", "invalid_request");
  const { userId } = parsed.data;
  const now = deps.now();
  try {
    const policy = await readPolicy(deps);
    const [spent, standing] = await Promise.all([
      gameZeniLastDay(deps, userId, now),
      standingOf(deps, policy, userId, now),
    ]);
    const reason = !policy.enabled
      ? "kill_switch"
      : standing.young || standing.lowLevel || standing.frozen
        ? "account_ineligible"
        : null;
    return ok({
      userId,
      dailyBudget: policy.dailyBudget,
      spent,
      remaining: Math.max(0, policy.dailyBudget - spent),
      windowHours: 24,
      eligible: reason === null,
      reason,
    });
  } catch (err) {
    logger.error({ err, userId }, "activity: budget read failed");
    return fail(500, "budget_failed", "internal");
  }
}

type ActivityRequest = Request & { params?: Record<string, string> };

/**
 * `Bun.serve` routes of the Activity service API, to be spread into the `routes` of the bot API
 * server. Everything is behind the service bearer token.
 */
export function createActivityRoutes(deps: ActivityDeps = defaultActivityDeps()) {
  return {
    "/api/activity/settle": { POST: (req: ActivityRequest) => handleSettle(deps, req) },
    "/api/activity/budget/:userId": { GET: (req: ActivityRequest) => handleBudget(deps, req) },
  };
}
