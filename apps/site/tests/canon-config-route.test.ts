import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let allowed = true;
let unavailable = false;
const expected = "a".repeat(64);
const config = { entries: [] };
const writes: unknown[][] = [];
class CanonConfigWriteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
mock.module("@/lib/admin-guard", () => ({
  isAdminOrToken: async () => allowed,
  adminUserOrToken: async () => ({ allowed, me: { discordId: "editor" } }),
}));
mock.module("@/lib/canon-config", () => ({
  CanonConfigWriteError,
  getCanonConfigSnapshot: async () => {
    if (unavailable) throw new Error("database unavailable");
    return { config, expected };
  },
  saveCanonConfig: async (...args: unknown[]) => {
    if (unavailable) throw new Error("database unavailable");
    if (!args[2]) throw new CanonConfigWriteError("snapshot required", 428);
    if (args[2] !== expected) throw new CanonConfigWriteError("snapshot changed", 409);
    writes.push(args);
    return { config: args[0], expected: "b".repeat(64) };
  },
}));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
const { GET, PUT } = await import("../src/app/api/canon-config/route");
const request = (body?: unknown) =>
  new NextRequest("https://dragonballfr.com/api/canon-config", {
    method: body === undefined ? "GET" : "PUT",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
beforeEach(() => {
  allowed = true;
  unavailable = false;
  writes.length = 0;
});

test("admin read returns the current snapshot and never caches it", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ config, expected });
});
test("unavailable database is a real admin error without defaults", async () => {
  unavailable = true;
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("config");
});
test("both routes enforce the admin gate", async () => {
  allowed = false;
  expect((await GET(request())).status).toBe(403);
  expect((await PUT(request({ config, expected }))).status).toBe(403);
  expect(writes).toEqual([]);
});
test("missing and stale snapshots cannot save", async () => {
  expect((await PUT(request({ config }))).status).toBe(428);
  expect((await PUT(request({ config, expected: "stale" }))).status).toBe(409);
  expect(writes).toEqual([]);
});
test("malformed documents are rejected before the writer", async () => {
  for (const body of [[], "bad", { config: [] }, { expected }]) {
    expect((await PUT(request(body))).status).toBe(400);
  }
  expect(writes).toEqual([]);
});
test("successful save returns the replacement snapshot", async () => {
  const response = await PUT(request({ config, expected }));
  expect(response.status).toBe(200);
  expect(writes).toEqual([[config, "editor", expected]]);
  expect(await response.json()).toEqual({ ok: true, config, expected: "b".repeat(64) });
});
test("save infrastructure failures are not reported as validation errors", async () => {
  unavailable = true;
  expect((await PUT(request({ config, expected }))).status).toBe(503);
});
