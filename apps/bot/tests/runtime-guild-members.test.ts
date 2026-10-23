import "./setup";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import {
  installMemberFetchGuard,
  isBulkMemberFetch,
  isGatewayRateLimit,
  MemberFetchCoordinator,
  RATE_LIMIT_MARGIN_MS,
  rateLimitWaitMs,
} from "../src/lib/guild-members";
import { GuildMirrorService, type MemberRow } from "../src/services/GuildMirrorService";

/** Shape of discord.js' `GatewayRateLimitError`, the way the production log shows it. */
function rateLimited(retryAfter = 28.69): Error {
  return Object.assign(
    new Error(`Request with opcode 8 was rate limited. Retry after ${retryAfter} seconds.`),
    { name: "GatewayRateLimitError", data: { opcode: 8, retry_after: retryAfter } },
  );
}

function fakeClock(start = 1_000_000) {
  let now = start;
  const slept: number[] = [];
  return {
    slept,
    advance: (ms: number) => {
      now += ms;
    },
    clock: {
      now: () => now,
      sleep: async (ms: number) => {
        slept.push(ms);
        now += ms;
      },
    },
  };
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("rate limit detection", () => {
  test("recognises the gateway error structurally and nothing else", () => {
    expect(isGatewayRateLimit(rateLimited())).toBe(true);
    expect(isGatewayRateLimit(new Error("Request with opcode 8 was rate limited"))).toBe(false);
    expect(isGatewayRateLimit(null)).toBe(false);
    expect(isGatewayRateLimit({ name: "GatewayRateLimitError" })).toBe(false);
  });

  test("waits the advertised delay plus a margin, capped", () => {
    expect(rateLimitWaitMs(rateLimited(28.69))).toBe(28_690 + RATE_LIMIT_MARGIN_MS);
    expect(rateLimitWaitMs(rateLimited(600), 90_000)).toBe(90_000);
  });

  test("only the whole-list form of fetch is a bulk fetch", () => {
    expect(isBulkMemberFetch(undefined)).toBe(true);
    expect(isBulkMemberFetch({ force: true })).toBe(true);
    expect(isBulkMemberFetch("123456789012345678")).toBe(false);
    expect(isBulkMemberFetch({ user: "1" })).toBe(false);
    expect(isBulkMemberFetch({ query: "ab", limit: 5 })).toBe(false);
    expect(isBulkMemberFetch({ limit: 5 })).toBe(false);
  });
});

describe("MemberFetchCoordinator", () => {
  test("concurrent callers share a single request", async () => {
    const { clock } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock);
    const gate = deferred<string[]>();
    let calls = 0;
    const fetchAll = () => {
      calls++;
      return gate.promise;
    };
    const none = { cached: () => null };
    const results = [
      coordinator.run("g", fetchAll, none),
      coordinator.run("g", fetchAll, none),
      coordinator.run("g", fetchAll, none),
    ];
    gate.resolve(["a"]);
    expect(await Promise.all(results)).toEqual([["a"], ["a"], ["a"]]);
    expect(calls).toBe(1);
  });

  test("a recent complete fetch is served from the cache, then refreshed once stale", async () => {
    const { clock, advance } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock, 60_000);
    let calls = 0;
    const fetchAll = async () => {
      calls++;
      return [`fetch-${calls}`];
    };
    const cached = () => ["cache"];
    expect(await coordinator.run("g", fetchAll, { cached })).toEqual(["fetch-1"]);
    advance(30_000);
    expect(await coordinator.run("g", fetchAll, { cached })).toEqual(["cache"]);
    expect(calls).toBe(1);
    advance(31_000);
    expect(await coordinator.run("g", fetchAll, { cached })).toEqual(["fetch-2"]);
    expect(calls).toBe(2);
  });

  test("an incomplete cache never replaces a fetch, and force skips the shortcut", async () => {
    const { clock } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock, 60_000);
    let calls = 0;
    const fetchAll = async () => ++calls;
    await coordinator.run("g", fetchAll, { cached: () => null });
    await coordinator.run("g", fetchAll, { cached: () => null });
    expect(calls).toBe(2);
    await coordinator.run("g", fetchAll, { cached: () => 99, force: true });
    expect(calls).toBe(3);
  });

  test("a gateway rate limit waits retry_after then retries once", async () => {
    const { clock, slept } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock);
    let calls = 0;
    const members = await coordinator.run(
      "g",
      async () => {
        calls++;
        if (calls === 1) throw rateLimited(28.69);
        return ["all"];
      },
      { cached: () => null },
    );
    expect(members).toEqual(["all"]);
    expect(calls).toBe(2);
    expect(slept).toEqual([28_690 + RATE_LIMIT_MARGIN_MS]);
  });

  test("a second rate limit surfaces; other errors are not retried", async () => {
    const { clock, slept } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock);
    let calls = 0;
    await expect(
      coordinator.run(
        "g",
        async () => {
          calls++;
          throw rateLimited(1);
        },
        { cached: () => null },
      ),
    ).rejects.toThrow("rate limited");
    expect(calls).toBe(2);
    expect(slept).toHaveLength(1);

    calls = 0;
    await expect(
      coordinator.run(
        "g",
        async () => {
          calls++;
          throw new Error("Members didn't arrive in time.");
        },
        { cached: () => null },
      ),
    ).rejects.toThrow("didn't arrive");
    expect(calls).toBe(1);
  });

  test("a failed fetch releases the slot so the next caller can try again", async () => {
    const { clock } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock);
    await expect(
      coordinator.run("g", () => Promise.reject(new Error("boom")), { cached: () => null }),
    ).rejects.toThrow("boom");
    expect(await coordinator.run("g", async () => "ok", { cached: () => null })).toBe("ok");
  });

  test("guilds are independent", async () => {
    const { clock } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock);
    let calls = 0;
    const fetchAll = async () => ++calls;
    await Promise.all([
      coordinator.run("a", fetchAll, { cached: () => null }),
      coordinator.run("b", fetchAll, { cached: () => null }),
    ]);
    expect(calls).toBe(2);
  });
});

describe("installMemberFetchGuard", () => {
  function fakeManagerClass() {
    const calls: unknown[] = [];
    const gate = deferred<Map<string, string>>();
    class Manager {
      guild = { id: "g1", memberCount: 2 };
      cache = new Map([
        ["1", "m1"],
        ["2", "m2"],
      ]);
      fetch(options?: unknown) {
        calls.push(options);
        return gate.promise;
      }
    }
    return { Manager, calls, gate };
  }

  test("simultaneous whole-list fetches reach Discord once; single fetches pass through", async () => {
    const { Manager, calls, gate } = fakeManagerClass();
    const { clock } = fakeClock();
    expect(installMemberFetchGuard(Manager, new MemberFetchCoordinator(clock))).toBe(true);
    const manager = new Manager();
    const all = [manager.fetch(), manager.fetch(), manager.fetch({ force: true })];
    const single = manager.fetch("123456789012345678");
    gate.resolve(new Map([["1", "m1"]]));
    await Promise.all([...all, single]);
    // One bulk request (no argument) and the untouched single-member call.
    expect(calls).toEqual([undefined, "123456789012345678"]);
  });

  test("is idempotent and reuses the member cache while a complete fetch is fresh", async () => {
    const { Manager, calls, gate } = fakeManagerClass();
    const { clock } = fakeClock();
    const coordinator = new MemberFetchCoordinator(clock);
    expect(installMemberFetchGuard(Manager, coordinator)).toBe(true);
    expect(installMemberFetchGuard(Manager, coordinator)).toBe(false);
    const manager = new Manager();
    gate.resolve(new Map());
    await manager.fetch();
    const again = await manager.fetch();
    expect(calls).toHaveLength(1);
    // The reused result is the manager's own cache (complete: 2 cached for a 2-member guild).
    expect(again).toBe(manager.cache as unknown as typeof again);
  });

  test("never serves a partial cache", async () => {
    const { Manager, calls, gate } = fakeManagerClass();
    const { clock } = fakeClock();
    installMemberFetchGuard(Manager, new MemberFetchCoordinator(clock));
    const manager = new Manager();
    manager.guild.memberCount = 50;
    gate.resolve(new Map());
    await manager.fetch();
    await manager.fetch();
    expect(calls).toHaveLength(2);
  });
});

/* ── GuildMirrorService.syncGuild with a rate limited member fetch ─────────── */

function migrated() {
  const db = new Database(":memory:");
  migrate(drizzle(db), { migrationsFolder: join(import.meta.dir, "../src/db/migrations") });
  return db;
}

const GUILD = "9000";

function fakeMember(id: string) {
  const roles = new Map([[GUILD, { id: GUILD }]]);
  return {
    id,
    nickname: null,
    avatar: null,
    pending: false,
    joinedTimestamp: 1_700_000_000_000,
    premiumSinceTimestamp: null,
    communicationDisabledUntilTimestamp: null,
    user: { username: `user${id}`, globalName: null, avatar: null, bot: false },
    roles: { cache: roles, highest: { id: GUILD } },
  };
}

function fakeGuild(options: {
  cached: string[];
  memberCount: number;
  fetch: () => Promise<Map<string, ReturnType<typeof fakeMember>>>;
}) {
  const cache = new Map(options.cached.map((id) => [id, fakeMember(id)]));
  return {
    id: GUILD,
    memberCount: options.memberCount,
    members: { cache, fetch: options.fetch },
    roles: { fetch: async () => new Map() },
    channels: { fetch: async () => new Map() },
  };
}

function seedMirror(db: Database, ids: string[]) {
  const service = new GuildMirrorService({ sqlite: db } as never);
  const rows: MemberRow[] = ids.map((id) => ({
    user_id: id,
    username: `user${id}`,
    global_name: null,
    nickname: null,
    avatar_hash: null,
    guild_avatar_hash: null,
    bot: 0,
    joined_at: 1,
    premium_since: null,
    timeout_until: null,
    pending: 0,
    role_ids: "[]",
    top_role_id: null,
  }));
  // Synced long before the run under test: a full sync only marks rows older than itself.
  service.store.upsertMembers(rows, 1_000);
  return service;
}

describe("guild mirror under a gateway rate limit", () => {
  test("a rate limited member fetch does not fail the sync and marks nobody as gone", async () => {
    const db = migrated();
    const service = seedMirror(db, ["1", "2", "3"]);
    // Only one member is cached and Discord says 3: the list is partial.
    const guild = fakeGuild({
      cached: ["1"],
      memberCount: 3,
      fetch: () => Promise.reject(rateLimited()),
    });
    const report = await service.syncGuild(guild as never);
    expect(report.membersComplete).toBe(false);
    expect(report.membersLeft).toBe(0);
    expect(service.store.stats().membersPresent).toBe(3);
    db.close();
  });

  test("a rate limited fetch with a complete cache still syncs completely", async () => {
    const db = migrated();
    const service = seedMirror(db, ["1", "2", "3"]);
    const guild = fakeGuild({
      cached: ["1", "2"],
      memberCount: 2,
      fetch: () => Promise.reject(rateLimited()),
    });
    const report = await service.syncGuild(guild as never);
    expect(report.membersComplete).toBe(true);
    expect(report.membersLeft).toBe(1);
    expect(service.store.stats().membersPresent).toBe(2);
    db.close();
  });

  test("a successful fetch is complete", async () => {
    const db = migrated();
    const service = seedMirror(db, ["1", "2"]);
    const fetched = new Map([["1", fakeMember("1")]]);
    const guild = fakeGuild({ cached: [], memberCount: 1, fetch: async () => fetched });
    const report = await service.syncGuild(guild as never);
    expect(report).toMatchObject({ membersComplete: true, members: 1, membersLeft: 1 });
    db.close();
  });

  test("an unrelated fetch error still fails the sync", async () => {
    const db = migrated();
    const service = seedMirror(db, ["1"]);
    const guild = fakeGuild({
      cached: [],
      memberCount: 1,
      fetch: () => Promise.reject(new Error("Members didn't arrive in time.")),
    });
    await expect(service.syncGuild(guild as never)).rejects.toThrow("didn't arrive");
    db.close();
  });
});

describe("the real discord.js GuildMemberManager", () => {
  test("whole-list fetches share one gateway request; a single-member fetch is untouched", async () => {
    const { Client, Collection, GuildMemberManager } = await import("discord.js");
    const { installMemberFetchGuard: install } = await import("../src/lib/guild-members");
    install();
    const client = new Client({ intents: [] });
    const guild = { client, id: "9100", memberCount: 3 };
    // The constructor is private in the typings; the guard under test is on the prototype.
    const manager = new (GuildMemberManager as unknown as new (guild: unknown) => {
      fetch(options?: unknown): Promise<unknown>;
    })(guild);
    let gatewayRequests = 0;
    let singles = 0;
    (manager as unknown as { _fetchMany: () => Promise<unknown> })._fetchMany = async () => {
      gatewayRequests++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Collection();
    };
    (manager as unknown as { _fetchSingle: () => Promise<unknown> })._fetchSingle = async () => {
      singles++;
      return { id: "123456789012345678" };
    };
    await Promise.all([manager.fetch(), manager.fetch(), manager.fetch({ force: true })]);
    expect(gatewayRequests).toBe(1);
    await manager.fetch("123456789012345678");
    expect(singles).toBe(1);
    expect(gatewayRequests).toBe(1);
  });
});
