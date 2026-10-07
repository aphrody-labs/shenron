// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import type { SiteReportInsert } from "@shenron/db/schema";
import { createReportHandler } from "../src/host/reports";
import { createMemoryRateLimiter } from "../src/http";
import type { BetterAuthPort } from "../src/server";

const payload = {
  path: "/desktop",
  pageTitle: null,
  category: "bug",
  message: "A real interface issue",
};
const policy = { origins: ["https://dragonballfr.com"], rateLimit: { limit: 2, windowMs: 60_000 } };
const session: BetterAuthPort = {
  handler: async () => new Response(null),
  session: async (headers) =>
    headers.get("cookie") === "session=valid"
      ? { userId: "member", discordId: "123456789", profile: null }
      : null,
};

async function withServer(
  auth: BetterAuthPort | null,
  repository: Parameters<typeof createReportHandler>[1],
  run: (url: URL) => Promise<void>,
) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: createReportHandler(auth, repository, createMemoryRateLimiter(), policy),
  });
  try {
    await run(new URL("/api/reports", server.url));
  } finally {
    await server.stop(true);
  }
}

function submit(url: URL, body: unknown = payload, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: "session=valid", ...headers },
    body: JSON.stringify(body),
  });
}

test("HTTP submission preserves context and takes identity only from the linked session", async () => {
  const rows: SiteReportInsert[] = [];
  await withServer(
    session,
    {
      insert: async (row) => {
        rows.push(row);
      },
    },
    async (url) => {
      const result = await submit(url, {
        ...payload,
        userId: "forged",
        discordId: "forged",
        status: "resolved",
      });
      expect(result.status).toBe(201);
      expect(result.headers.get("cache-control")).toBe("private, no-store");
      expect(await result.json()).toEqual({ ok: true });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ ...payload, userId: "member", discordId: "123456789" });
      expect(rows[0]).not.toHaveProperty("status");
    },
  );
});

test("anonymous, cross-origin, malformed and oversized requests never persist", async () => {
  const rows: SiteReportInsert[] = [];
  await withServer(
    session,
    {
      insert: async (row) => {
        rows.push(row);
      },
    },
    async (url) => {
      expect((await submit(url, payload, { cookie: "", "x-shenron-owner": "admin" })).status).toBe(
        401,
      );
      expect((await submit(url, payload, { origin: "https://foreign.test" })).status).toBe(403);
      expect((await submit(url, { ...payload, message: "short" })).status).toBe(400);
      expect((await submit(url, { ...payload, category: "unknown" })).status).toBe(400);
      expect((await submit(url, { ...payload, path: "//foreign.test" })).status).toBe(400);
      expect((await submit(url, { ...payload, message: "x".repeat(20_000) })).status).toBe(413);
      expect(rows).toHaveLength(0);
    },
  );
});

test("rate limit is shared by authenticated identity and returns retry metadata", async () => {
  let count = 0;
  await withServer(
    session,
    {
      insert: async () => {
        count++;
      },
    },
    async (url) => {
      expect((await submit(url)).status).toBe(201);
      expect((await submit(url, payload, { "x-forwarded-for": "203.0.113.7" })).status).toBe(201);
      const limited = await submit(url, payload, { "x-forwarded-for": "203.0.113.8" });
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("60");
      expect(count).toBe(2);
    },
  );
});

test("missing and failed capabilities return a private unavailable response", async () => {
  for (const [auth, repository] of [
    [null, null],
    [
      session,
      {
        insert: async () => {
          throw new Error("private database detail");
        },
      },
    ],
  ] as const) {
    await withServer(auth, repository, async (url) => {
      const result = await submit(url);
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ error: "reports_unavailable" });
      expect((await fetch(url)).status).toBe(405);
    });
  }
});
