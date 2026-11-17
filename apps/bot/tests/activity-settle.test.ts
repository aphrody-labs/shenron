// SPDX-License-Identifier: Apache-2.0
/**
 * Settlement of the Arène Shenron Activity (`POST /api/activity/settle`, `GET /api/activity/budget`):
 * receipt checks (signature, window, caps, replay), the common daily budget, the account checks,
 * the credit through the real `EconomyService` on the migrated test base, and the game XP port.
 */
import "./setup"; // must be first
import { beforeAll, describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { and, eq, like } from "drizzle-orm";
import {
  buildReceipt,
  DEFAULT_REWARD_POLICY,
  signReceipt,
  type RewardLine,
  type SettlementReceipt,
  type SignedReceipt,
} from "@aphrody/shenron-activity/quiz";
import { ActivityBudgetResponse, ActivitySettleResponse } from "@aphrody/shenron-api/contract";
import { DatabaseService } from "~/db/index";
import { actionLogs, activitySettlements, users } from "~/db/schema";
import { getLevelThresholds } from "~/lib/xp";

const { EconomyService } = await import("~/services/EconomyService");
const { createActivityRoutes } = await import("~/api/activity");
type ActivityDeps = import("~/api/activity").ActivityDeps;
type ActivityXpInput = import("~/api/activity").ActivityXpInput;
type ActivityXpResult = import("~/api/activity").ActivityXpResult;

const SECRET = "test-activity-secret-0123456789abcdef";
const TOKEN = "test-activity-token-0123456789abcdef";
const ADMIN_TOKEN = "test-admin-token-0123456789abcdef";
const DAY_MS = 86_400_000;
const DISCORD_EPOCH_MS = 1_420_070_400_000;

const dbs = container.resolve(DatabaseService);
const eco = container.resolve(EconomyService);

const clock = { now: Date.now() };
const settingValues = new Map<string, number | boolean>();
const settings: ActivityDeps["settings"] = {
  getInt: async (key, fallback) => (settingValues.get(key) as number | undefined) ?? fallback,
  getBool: async (key, fallback) => (settingValues.get(key) as boolean | undefined) ?? fallback,
};

function xpPort(result: ActivityXpResult = { xp: 12, capped: false, levelUp: false }) {
  const calls: ActivityXpInput[] = [];
  return {
    calls,
    port: {
      async grantGameXp(input: ActivityXpInput) {
        calls.push(input);
        return result;
      },
    },
  };
}

function makeDeps(over: Partial<ActivityDeps> = {}): ActivityDeps {
  return {
    now: () => clock.now,
    secret: () => SECRET,
    tokens: () => [TOKEN, ADMIN_TOKEN],
    settings,
    db: dbs,
    economy: eco,
    xp: () => null,
    resolveMember: async () => null,
    ...over,
  };
}

/** Old enough to pass the account-age check (a 2022 snowflake). */
const uid = (n: number) => `9100000000000${String(n).padStart(5, "0")}`;
/** A snowflake created `ageMs` ago. */
const snowflakeAged = (ageMs: number) =>
  ((BigInt(clock.now - ageMs - DISCORD_EPOCH_MS) << 22n) | 1n).toString();

const LEVEL_2_XP = getLevelThresholds().find((t) => t.level >= 2)!.xp;

async function member(id: string, values: Partial<typeof users.$inferInsert> = {}) {
  await dbs.db.delete(actionLogs).where(eq(actionLogs.userId, id));
  await dbs.db.delete(users).where(eq(users.id, id));
  await dbs.db.insert(users).values({ id, zeni: 0, xp: LEVEL_2_XP, ...values });
}

async function balance(id: string) {
  return (await dbs.db.select().from(users).where(eq(users.id, id)).get())?.zeni ?? 0;
}

let roundCounter = 0;
const nextRound = () => `t${(++roundCounter).toString(36)}-${roundCounter}`;

function line(userId: string, rank: number, zeni: number, over: Partial<RewardLine> = {}) {
  return {
    userId,
    rank,
    score: 1_000 - rank * 100,
    correct: 5,
    answered: 5,
    zeni,
    reason: zeni > 0 ? "podium" : "off_podium",
    ...over,
  } as RewardLine;
}

function receiptOf(lines: RewardLine[], over: { roundId?: string; now?: number } = {}) {
  return buildReceipt({
    instanceId: "inst-1",
    roundId: over.roundId ?? nextRound(),
    now: over.now ?? clock.now,
    questionCount: 5,
    lines,
  });
}

const sign = (receipt: SettlementReceipt, secret = SECRET) => signReceipt(receipt, secret);

type Routes = ReturnType<typeof createActivityRoutes>;

function post(routes: Routes, body: unknown, token: string | null = TOKEN, raw?: string) {
  return routes["/api/activity/settle"].POST(
    new Request("http://bot.local/api/activity/settle", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: raw ?? JSON.stringify(body),
    }),
  );
}

function budget(routes: Routes, userId: string, token: string | null = TOKEN) {
  const request = new Request(`http://bot.local/api/activity/budget/${userId}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return routes["/api/activity/budget/:userId"].GET(Object.assign(request, { params: { userId } }));
}

async function settle(routes: Routes, signed: SignedReceipt) {
  const response = await post(routes, signed);
  return { response, body: (await response.json()) as ActivitySettleResponse };
}

async function gameGains(userId: string) {
  return dbs.db
    .select()
    .from(actionLogs)
    .where(
      and(
        eq(actionLogs.userId, userId),
        eq(actionLogs.action, "ZENI_GAIN"),
        like(actionLogs.meta, '%"source":"activity"%'),
      ),
    );
}

beforeAll(() => {
  settingValues.clear();
});

describe("service authentication", () => {
  test("no configured token closes the routes (503)", async () => {
    const routes = createActivityRoutes(makeDeps({ tokens: () => [] }));
    const signed = await sign(receiptOf([line(uid(1), 1, 0)]));
    expect((await post(routes, signed)).status).toBe(503);
    expect((await budget(routes, uid(1))).status).toBe(503);
  });

  test("a missing or wrong bearer is refused, the dedicated and the admin tokens are accepted", async () => {
    const routes = createActivityRoutes(makeDeps());
    const signed = await sign(receiptOf([line(uid(1), 1, 0)]));
    expect((await post(routes, signed, null)).status).toBe(401);
    expect((await post(routes, signed, "wrong-token-0123456789abcdef")).status).toBe(401);
    expect((await budget(routes, uid(1), null)).status).toBe(401);
    expect((await budget(routes, uid(1), TOKEN)).status).toBe(200);
    expect((await budget(routes, uid(1), ADMIN_TOKEN)).status).toBe(200);
    // The refusal says nothing about why (no oracle on the token).
    const denied = await post(routes, signed, "wrong-token-0123456789abcdef");
    expect(await denied.json()).toEqual({ error: "unauthenticated", code: "unauthenticated" });
  });

  test("without a usable secret the settlement answers 503", async () => {
    const signed = await sign(receiptOf([line(uid(1), 1, 0)]));
    for (const secret of [undefined, "short"]) {
      const routes = createActivityRoutes(makeDeps({ secret: () => secret }));
      const response = await post(routes, signed);
      expect(response.status).toBe(503);
      expect(((await response.json()) as { error: string }).error).toBe("not_configured");
    }
  });
});

describe("receipt verification", () => {
  const routes = createActivityRoutes(makeDeps());

  async function refused(response: Response, status: number, error: string) {
    expect(response.status).toBe(status);
    expect(((await response.json()) as { error: string }).error).toBe(error);
  }

  test("malformed bodies are 400", async () => {
    await refused(await post(routes, null, TOKEN, "{not json"), 400, "invalid_receipt");
    await refused(await post(routes, { hello: "world" }), 400, "invalid_receipt");
    await refused(await post(routes, []), 400, "invalid_receipt");
  });

  test("a body above the limit is 413", async () => {
    const big = JSON.stringify({ pad: "x".repeat(70 * 1024) });
    await refused(await post(routes, null, TOKEN, big), 413, "body_too_large");
  });

  test("an XP field, or any extra key, makes the receipt malformed", async () => {
    const signed = await sign(receiptOf([line(uid(1), 1, 60)]));
    const withXp = structuredClone(signed) as unknown as {
      receipt: { entries: Record<string, unknown>[] };
    };
    withXp.receipt.entries[0]!.xp = 999;
    await refused(await post(routes, withXp), 400, "invalid_receipt");
    await refused(await post(routes, { ...signed, extra: true }), 400, "invalid_receipt");
  });

  test("a tampered amount fails the signature (403)", async () => {
    const id = uid(2);
    await member(id);
    const signed = await sign(receiptOf([line(id, 1, 20, { reason: "podium" })]));
    const forged = structuredClone(signed);
    forged.receipt.entries[0]!.zeni = 60;
    await refused(await post(routes, forged), 403, "bad_signature");
    expect(await balance(id)).toBe(0);
  });

  test("a receipt signed with another secret fails the signature", async () => {
    const signed = await sign(receiptOf([line(uid(2), 1, 60)]), "another-secret-0123456789abcdef");
    await refused(await post(routes, signed), 403, "bad_signature");
  });

  test("an expired receipt is 410, a receipt from the future is 400", async () => {
    const stale = await sign(receiptOf([line(uid(2), 1, 60)], { now: clock.now - 16 * 60_000 }));
    await refused(await post(routes, stale), 410, "receipt_expired");
    const future = await sign(receiptOf([line(uid(2), 1, 60)], { now: clock.now + 10 * 60_000 }));
    await refused(await post(routes, future), 400, "receipt_not_yet_valid");
  });

  test("caps above the bot's own policy are refused (422), even when correctly signed", async () => {
    const id = uid(3);
    await member(id);
    // 100 zeni for first place: above the per-round cap (60) and above the podium.
    const overCap = await sign(receiptOf([line(id, 1, 100)]));
    await refused(await post(routes, overCap), 422, "receipt_out_of_bounds");
    // A raised cap in the receipt's own policy does not raise the bot's.
    const raised = receiptOf([line(id, 1, 100)]);
    raised.policy.perRoundCapZeni = 500;
    raised.policy.podiumZeni = [500, 40, 20];
    await refused(await post(routes, await sign(raised)), 422, "receipt_out_of_bounds");
    // Pays without a podium reason.
    const noReason = await sign(receiptOf([line(id, 1, 40, { reason: "off_podium" })]));
    await refused(await post(routes, noReason), 422, "receipt_out_of_bounds");
    // More than the whole podium (60 + 40 + 20) over several members.
    const crowd = await sign(
      receiptOf([line(id, 1, 60), line(uid(4), 2, 60), line(uid(5), 3, 60), line(uid(6), 4, 60)]),
    );
    await refused(await post(routes, crowd), 422, "receipt_out_of_bounds");
    // Wrong idempotency key.
    const wrongKey = receiptOf([line(id, 1, 60)]);
    wrongKey.entries[0]!.idempotencyKey = "activity:other:round-1:" + id;
    await refused(await post(routes, await sign(wrongKey)), 422, "receipt_out_of_bounds");
    expect(await balance(id)).toBe(0);
    expect(
      await dbs.db.select().from(activitySettlements).where(eq(activitySettlements.userId, id)),
    ).toHaveLength(0);
  });
});

describe("settlement and credit through EconomyService", () => {
  test("the podium is credited exactly, without race multiplier, and journalled", async () => {
    const [a, b, c] = [uid(10), uid(11), uid(12)];
    // A Majin would get +50 % on a game gain through `addZeni`: the Activity pays the face value.
    await member(a, { race: "majin" });
    await member(b);
    await member(c);
    const roundId = nextRound();
    const routes = createActivityRoutes(makeDeps());
    const signed = await sign(
      receiptOf([line(a, 1, 60), line(b, 2, 40), line(c, 3, 20)], { roundId }),
    );
    const { response, body } = await settle(routes, signed);

    expect(response.status).toBe(200);
    expect(ActivitySettleResponse.safeParse(body).success).toBe(true);
    expect(body.replayed).toBe(false);
    expect(body.totalGranted).toBe(120);
    expect(body.entries.map((e) => [e.userId, e.status, e.requested, e.granted, e.reason])).toEqual(
      [
        [a, "settled", 60, 60, "podium"],
        [b, "settled", 40, 40, "podium"],
        [c, "settled", 20, 20, "podium"],
      ],
    );
    expect(body.entries[0]!.budgetLeft).toBe(540);
    expect([await balance(a), await balance(b), await balance(c)]).toEqual([60, 40, 20]);

    // The ledger of the economy service: a game gain from the `activity` source.
    const gains = await gameGains(a);
    expect(gains).toHaveLength(1);
    expect(JSON.parse(gains[0]!.meta!)).toMatchObject({
      amount: 60,
      kind: "game",
      source: "activity",
    });

    // The idempotency ledger and the settlement journal.
    const rows = await dbs.db
      .select()
      .from(activitySettlements)
      .where(eq(activitySettlements.roundId, roundId));
    expect(rows.map((r) => [r.userId, r.requested, r.granted, r.status]).toSorted()).toEqual(
      [a, b, c].map((id, i) => [id, [60, 40, 20][i], [60, 40, 20][i], "settled"]).toSorted(),
    );
    const journal = await dbs.db
      .select()
      .from(actionLogs)
      .where(
        and(eq(actionLogs.action, "ACTIVITY_SETTLED"), eq(actionLogs.reason, `inst-1:${roundId}`)),
      );
    expect(journal).toHaveLength(1);
    expect(JSON.parse(journal[0]!.meta!)).toMatchObject({ players: 3, paid: 3, totalGranted: 120 });
  });

  test("a replayed receipt pays nothing again and reports the first outcome", async () => {
    const [a, b] = [uid(20), uid(21)];
    await member(a);
    await member(b);
    const xp = xpPort();
    const routes = createActivityRoutes(makeDeps({ xp: () => xp.port }));
    const signed = await sign(receiptOf([line(a, 1, 60), line(b, 2, 40)]));

    const first = await settle(routes, signed);
    expect(first.body.replayed).toBe(false);
    expect(xp.calls).toHaveLength(2);

    const second = await settle(routes, signed);
    expect(second.response.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.totalGranted).toBe(0);
    expect(second.body.totalXp).toBe(0);
    expect(second.body.entries.map((e) => [e.status, e.granted, e.reason])).toEqual([
      ["duplicate", 60, "podium"],
      ["duplicate", 40, "podium"],
    ]);
    // Nothing moved: balances, ledger lines and XP grants.
    expect([await balance(a), await balance(b)]).toEqual([60, 40]);
    expect(await gameGains(a)).toHaveLength(1);
    expect(xp.calls).toHaveLength(2);
    const rows = await dbs.db
      .select()
      .from(activitySettlements)
      .where(eq(activitySettlements.roundId, signed.receipt.roundId));
    expect(rows).toHaveLength(2);
  });

  test("two simultaneous posts of one receipt pay once", async () => {
    const id = uid(22);
    await member(id);
    const routes = createActivityRoutes(makeDeps());
    const signed = await sign(receiptOf([line(id, 1, 60), line(uid(23), 2, 0)]));
    const [one, two] = await Promise.all([post(routes, signed), post(routes, signed)]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(await balance(id)).toBe(60);
    expect(await gameGains(id)).toHaveLength(1);
  });

  test("an entry of a replayed receipt is the only one refused when the receipt is extended", async () => {
    const [a, b] = [uid(24), uid(25)];
    await member(a);
    await member(b);
    const roundId = nextRound();
    const routes = createActivityRoutes(makeDeps());
    await settle(routes, await sign(receiptOf([line(a, 1, 60)], { roundId })));
    // The same round re-issued with one more member: only the new key is paid.
    const { body } = await settle(
      routes,
      await sign(receiptOf([line(a, 1, 60), line(b, 2, 40)], { roundId })),
    );
    expect(body.entries.map((e) => [e.userId, e.status, e.granted])).toEqual([
      [a, "duplicate", 60],
      [b, "settled", 40],
    ]);
    expect(await balance(a)).toBe(60);
    expect(await balance(b)).toBe(40);
  });

  test("a failing credit releases the claim so a retry can settle", async () => {
    const id = uid(26);
    await member(id);
    const broken = createActivityRoutes(
      makeDeps({
        economy: {
          creditZeni: async () => {
            throw new Error("database is locked");
          },
        },
      }),
    );
    const signed = await sign(receiptOf([line(id, 1, 60)]));
    const failed = await post(broken, signed);
    expect(failed.status).toBe(500);
    expect(
      await dbs.db.select().from(activitySettlements).where(eq(activitySettlements.userId, id)),
    ).toHaveLength(0);
    const { body } = await settle(createActivityRoutes(makeDeps()), signed);
    expect(body.entries[0]).toMatchObject({ status: "settled", granted: 60 });
    expect(await balance(id)).toBe(60);
  });

  test("a frozen account is not paid", async () => {
    const id = uid(27);
    await member(id, { zeniFrozen: true });
    const { body } = await settle(
      createActivityRoutes(makeDeps()),
      await sign(receiptOf([line(id, 1, 60)])),
    );
    expect(body.entries[0]).toMatchObject({ granted: 0, reason: "account_ineligible" });
    expect(await balance(id)).toBe(0);
  });
});

describe("common daily budget", () => {
  async function spend(
    userId: string,
    amount: number,
    over: { kind?: string; ageMs?: number } = {},
  ) {
    await dbs.db.insert(actionLogs).values({
      userId,
      action: "ZENI_GAIN",
      meta: JSON.stringify({ amount, kind: over.kind ?? "game", source: "game" }),
      createdAt: new Date(clock.now - (over.ageMs ?? 60_000)),
    });
  }

  test("what a member already received from any game this day is deducted", async () => {
    const id = uid(30);
    await member(id);
    await spend(id, 300);
    await spend(id, 250);
    const routes = createActivityRoutes(makeDeps());
    // 600 - 550 = 50 left: first place (60) is cut to 50.
    const { body } = await settle(routes, await sign(receiptOf([line(id, 1, 60)])));
    expect(body.entries[0]).toMatchObject({ granted: 50, reason: "daily_budget", budgetLeft: 0 });
    expect(await balance(id)).toBe(50);
    // The budget is now empty: the next round pays nothing.
    const next = await settle(routes, await sign(receiptOf([line(id, 1, 60)])));
    expect(next.body.entries[0]).toMatchObject({ granted: 0, reason: "daily_budget" });
    expect(await balance(id)).toBe(50);
    expect(await gameGains(id)).toHaveLength(1);
  });

  test("stakes and gains older than 24 hours do not count", async () => {
    const id = uid(31);
    await member(id);
    await spend(id, 500, { kind: "stake" });
    await spend(id, 500, { ageMs: DAY_MS + 60_000 });
    const response = await budget(createActivityRoutes(makeDeps()), id);
    const body = (await response.json()) as ActivityBudgetResponse;
    expect(ActivityBudgetResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      dailyBudget: 600,
      spent: 0,
      remaining: 600,
      eligible: true,
      reason: null,
    });
  });

  test("activity.daily_budget is adjustable and clamped to the hard limit", async () => {
    const id = uid(32);
    await member(id);
    await spend(id, 90);
    const routes = createActivityRoutes(makeDeps());
    settingValues.set("activity.daily_budget", 100);
    const low = (await (await budget(routes, id)).json()) as ActivityBudgetResponse;
    expect(low).toMatchObject({ dailyBudget: 100, spent: 90, remaining: 10 });
    const { body } = await settle(routes, await sign(receiptOf([line(id, 1, 60)])));
    expect(body.entries[0]).toMatchObject({ granted: 10, reason: "daily_budget" });
    settingValues.set("activity.daily_budget", 1_000_000);
    const high = (await (await budget(routes, id)).json()) as ActivityBudgetResponse;
    expect(high.dailyBudget).toBe(5_000);
    settingValues.delete("activity.daily_budget");
  });

  test("the budget route validates the member id", async () => {
    const response = await budget(createActivityRoutes(makeDeps()), "not-a-snowflake");
    expect(response.status).toBe(400);
  });
});

describe("account checks and kill switch", () => {
  test("a young account earns neither zeni nor XP", async () => {
    const id = snowflakeAged(2 * DAY_MS);
    await member(id);
    const xp = xpPort();
    const routes = createActivityRoutes(makeDeps({ xp: () => xp.port }));
    const { body } = await settle(routes, await sign(receiptOf([line(id, 1, 60)])));
    expect(body.entries[0]).toMatchObject({ granted: 0, xp: 0, reason: "account_ineligible" });
    expect(await balance(id)).toBe(0);
    expect(xp.calls).toHaveLength(0);
    const state = (await (await budget(routes, id)).json()) as ActivityBudgetResponse;
    expect(state).toMatchObject({ eligible: false, reason: "account_ineligible" });
  });

  test("a low level earns no zeni but keeps the game XP", async () => {
    const id = uid(40);
    await member(id, { xp: 0 });
    const xp = xpPort();
    const routes = createActivityRoutes(makeDeps({ xp: () => xp.port }));
    const { body } = await settle(routes, await sign(receiptOf([line(id, 1, 60)])));
    expect(body.entries[0]).toMatchObject({ granted: 0, xp: 12, reason: "account_ineligible" });
    expect(await balance(id)).toBe(0);
    expect(xp.calls.map((c) => c.outcome)).toEqual(["podium"]);
  });

  test("the kill switch settles the round without paying anything", async () => {
    const id = uid(41);
    await member(id);
    const xp = xpPort();
    const routes = createActivityRoutes(makeDeps({ xp: () => xp.port }));
    settingValues.set("features.games.arena", false);
    try {
      const signed = await sign(receiptOf([line(id, 1, 60)]));
      const { body } = await settle(routes, signed);
      expect(body.entries[0]).toMatchObject({ granted: 0, xp: 0, reason: "kill_switch" });
      expect(xp.calls).toHaveLength(0);
      const state = (await (await budget(routes, id)).json()) as ActivityBudgetResponse;
      expect(state).toMatchObject({ eligible: false, reason: "kill_switch" });
      // The round is final: lifting the switch does not let the same receipt pay.
      settingValues.delete("features.games.arena");
      const again = await settle(routes, signed);
      expect(again.body.entries[0]).toMatchObject({ status: "duplicate", granted: 0 });
      expect(await balance(id)).toBe(0);
    } finally {
      settingValues.delete("features.games.arena");
    }
  });
});

describe("game XP through the injected port", () => {
  test("podium places get `podium`, other eligible players `play`, nobody else gets XP", async () => {
    const ids = [50, 51, 52, 53, 54, 55, 56].map(uid);
    for (const id of ids) await member(id);
    const xp = xpPort({ xp: 30, capped: false, levelUp: true, newLevel: 3 });
    const routes = createActivityRoutes(makeDeps({ xp: () => xp.port }));
    const [first, second, third, fourth, idle, flagged, alone] = ids as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const signed = await sign(
      receiptOf([
        line(first, 1, 60),
        line(second, 2, 40),
        line(third, 3, 20),
        line(fourth, 4, 0, { reason: "off_podium" }),
        line(idle, 5, 0, { reason: "inactive", answered: 1, correct: 0 }),
        line(flagged, 6, 0, { reason: "flagged" }),
        line(alone, 7, 0, { reason: "solo" }),
      ]),
    );
    const { body } = await settle(routes, signed);
    expect(xp.calls.map((c) => [c.userId, c.outcome, c.game])).toEqual([
      [first, "podium", "arena-quiz"],
      [second, "podium", "arena-quiz"],
      [third, "podium", "arena-quiz"],
      [fourth, "play", "arena-quiz"],
    ]);
    expect(body.totalXp).toBe(120);
    expect(body.entries[0]).toMatchObject({ xp: 30, levelUp: true, newLevel: 3, xpCapped: false });
    expect(body.entries[4]).toMatchObject({ xp: 0, levelUp: false, newLevel: null });
    // Replaying grants no XP.
    await settle(routes, signed);
    expect(xp.calls).toHaveLength(4);
  });

  test("a failing XP service never undoes the zeni, and the port is optional", async () => {
    const [a, b] = [uid(60), uid(61)];
    await member(a);
    await member(b);
    const failing = createActivityRoutes(
      makeDeps({
        xp: () => ({
          grantGameXp: async () => {
            throw new Error("level service down");
          },
        }),
      }),
    );
    const { body } = await settle(failing, await sign(receiptOf([line(a, 1, 60)])));
    expect(body.entries[0]).toMatchObject({ granted: 60, xp: 0 });
    expect(await balance(a)).toBe(60);

    const without = createActivityRoutes(makeDeps({ xp: () => null }));
    const second = await settle(without, await sign(receiptOf([line(b, 1, 60)])));
    expect(second.body.entries[0]).toMatchObject({ granted: 60, xp: 0 });
  });

  test("the member is resolved for the level-up announcement", async () => {
    const id = uid(62);
    await member(id);
    const xp = xpPort();
    const fakeMember = { id } as unknown as import("discord.js").GuildMember;
    const routes = createActivityRoutes(
      makeDeps({ xp: () => xp.port, resolveMember: async () => fakeMember }),
    );
    await settle(routes, await sign(receiptOf([line(id, 1, 60)])));
    expect(xp.calls[0]!.member).toBe(fakeMember);
  });
});

test("the shipped default policy matches the documented 600 / 60-40-20", () => {
  expect(DEFAULT_REWARD_POLICY.dailyBudgetZeni).toBe(600);
  expect([...DEFAULT_REWARD_POLICY.podiumZeni]).toEqual([60, 40, 20]);
});
