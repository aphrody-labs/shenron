// SPDX-License-Identifier: Apache-2.0
/**
 * A stand-in for the bot's settlement endpoint, for development and browser checks. It speaks the
 * contract of `packages/api/src/contract/activity.ts`: `POST /api/activity/settle` checks the
 * bearer token, verifies the signed receipt exactly as the bot must (`verifyReceipt`: schema,
 * signature, validity window, bounds), and answers `ActivitySettleResponse`. It pays what the
 * receipt allows, remembers every idempotency key (a second POST of the same key pays nothing and
 * reports what was paid the first time, like the real bot), and keeps no state beyond the process.
 */
import { verifyReceipt } from "@aphrody/shenron-activity/quiz";

export interface FakeBot {
  readonly url: string;
  /** Receipts accepted so far, in order. */
  readonly accepted: Array<{ roundId: string; userIds: string[] }>;
  stop(): Promise<void>;
}

/** The statuses of `ACTIVITY_SETTLE_FAILURES`. */
const FAILURES = {
  malformed: 400,
  not_yet_valid: 400,
  bad_signature: 403,
  expired: 410,
  out_of_bounds: 422,
} as const;

export function startFakeBot(options: { secret: string; token?: string; port?: number }): FakeBot {
  const paid = new Map<string, { granted: number; reason: string; requested: number }>();
  const accepted: FakeBot["accepted"] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/api/activity/settle")
        return new Response("Not Found", { status: 404 });
      if (options.token && request.headers.get("authorization") !== `Bearer ${options.token}`)
        return Response.json({ error: "unauthenticated" }, { status: 401 });
      const verdict = await verifyReceipt(await request.json().catch(() => null), options.secret, {
        now: Date.now(),
      });
      if (!verdict.ok)
        return Response.json({ error: verdict.reason }, { status: FAILURES[verdict.reason] });
      const { receipt } = verdict;
      const entries = receipt.entries.map((entry) => {
        const before = paid.get(entry.idempotencyKey);
        const line = before ?? { granted: entry.zeni, reason: entry.reason, requested: entry.zeni };
        paid.set(entry.idempotencyKey, line);
        return {
          userId: entry.userId,
          idempotencyKey: entry.idempotencyKey,
          status: before ? "duplicate" : "settled",
          requested: line.requested,
          granted: line.granted,
          reason: line.reason,
          xp: 0,
          xpCapped: false,
          levelUp: false,
          newLevel: null,
          budgetLeft: 600,
        };
      });
      accepted.push({ roundId: receipt.roundId, userIds: receipt.entries.map((e) => e.userId) });
      const fresh = entries.filter((entry) => entry.status === "settled");
      return Response.json({
        ok: true,
        instanceId: receipt.instanceId,
        roundId: receipt.roundId,
        replayed: fresh.length === 0,
        totalGranted: fresh.reduce((sum, entry) => sum + entry.granted, 0),
        totalXp: 0,
        entries,
      });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    accepted,
    async stop() {
      await server.stop(true);
    },
  };
}
