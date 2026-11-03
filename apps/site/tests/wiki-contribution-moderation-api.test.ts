// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, spyOn, test } from "bun:test";
import { NextRequest } from "next/server";

let auth: boolean | Error = true;
let listFailure = false;
let moderationFailure = false;
let passed: unknown;
let actor: unknown;
let decisions = 0;
mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({
  isCurrentUserAdmin: async () => {
    if (auth instanceof Error) throw auth;
    return auth;
  },
  getCurrentUser: async () => ({ user: { id: "owner" } }),
  revisionActorOf: () => ({ id: "owner", name: "API automation" }),
}));
mock.module("@/lib/databooks-freeze", () => ({ DatabooksFrozenError: class extends Error {} }));
mock.module("@/lib/wiki-contributions", () => ({
  ContributionError: class extends Error {},
  countByStatus: async () => ({ pending: 3 }),
  listContributions: async (options: unknown) => {
    if (listFailure) throw new Error("private DB data");
    passed = options;
    return { rows: [], total: 3, limit: 2, offset: 2 };
  },
  acceptContribution: async (_id: string, inputActor: unknown) => {
    decisions++;
    actor = inputActor;
    if (moderationFailure) throw new Error("private write failure");
    return { id: "1", status: "accepted" };
  },
  rejectContribution: async () => {
    decisions++;
    return { id: "1", status: "rejected" };
  },
}));
const { GET, POST } = await import("../src/app/api/admin/wiki-contributions/route");
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/wiki-contributions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  auth = true;
  listFailure = false;
  moderationFailure = false;
  passed = null;
  actor = null;
  decisions = 0;
});

test("queue validates pagination and returns private counts", async () => {
  const response = await GET(
    new NextRequest(
      "http://localhost/api/admin/wiki-contributions?limit=2&offset=2&status=pending",
    ),
  );
  expect(passed).toEqual({ limit: 2, offset: 2, status: "pending" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ total: 3, counts: { pending: 3 }, offset: 2 });
  expect(
    (await GET(new NextRequest("http://localhost/api/admin/wiki-contributions?offset=Infinity")))
      .status,
  ).toBe(400);
});

test("malformed moderation cannot reach a writer and automation identity is preserved", async () => {
  for (const body of [
    null,
    { id: {}, action: "accept" },
    { id: "1", action: "accept", note: {} },
  ]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(decisions).toBe(0);
  const response = await POST(request({ id: "1", action: "accept" }));
  expect(response.status).toBe(200);
  expect(actor).toEqual({ id: "owner", name: "API automation" });
});

test("denied and unavailable sessions are distinct private responses", async () => {
  auth = false;
  expect((await POST(request({ id: "1", action: "accept" }))).status).toBe(403);
  auth = new Error("private auth detail");
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await GET(new NextRequest("http://localhost/api/admin/wiki-contributions"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toEqual({ error: "auth_unavailable" });
    expect(decisions).toBe(0);
  } finally {
    log.mockRestore();
  }
});

test("queue and writer outages do not leak details or claim success", async () => {
  listFailure = true;
  moderationFailure = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      (await GET(new NextRequest("http://localhost/api/admin/wiki-contributions"))).status,
    ).toBe(503);
    const response = await POST(request({ id: "1", action: "accept" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "moderation_unavailable" });
  } finally {
    log.mockRestore();
  }
});
