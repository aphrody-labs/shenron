// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  ConversationDetail,
  ConversationListResponse,
  SyncPullResponse,
  SyncPushResponse,
} from "../src/contract";
import { createShenronApi } from "../src/server";
import {
  ALICE,
  BOB,
  basePorts,
  conversationRecord,
  countingRateLimit,
  expectApiError,
  fakeConversationStore,
  messageRecord,
} from "./support/ports";

const SYNC = "/api/v1/sync/conversations";
const LIST = "/api/v1/conversations";
const DETAIL = "/api/v1/conversations/{id}";

function setup(o: { fail?: string } = {}) {
  const fake = fakeConversationStore(o);
  const api = createShenronApi(basePorts({ conversations: fake.store }), {
    service: "shenron-desktop",
  });
  return { api, calls: fake.calls };
}

const push = (body: unknown, headers: Record<string, string> = ALICE): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

describe("sync group: routing and authentication", () => {
  test("GET and POST share the sync path; other methods → 404; OPTIONS → 204", async () => {
    const { api } = setup();
    expect(api.handles(SYNC)).toBe(true);
    expect(api.handles(LIST)).toBe(true);
    expect(api.handles("/api/v1/conversations/conv-0001")).toBe(true);
    for (const [method, path] of [
      ["PUT", SYNC],
      ["DELETE", "/api/v1/conversations/conv-0001"],
      ["POST", LIST],
    ] as const) {
      const res = await api.request(path, { method, headers: ALICE });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    expect((await api.request(SYNC, { method: "OPTIONS" })).status).toBe(204);
  });

  test("without the store the group claims nothing", () => {
    const api = createShenronApi(basePorts({ conversations: null }), { service: "shenron-site" });
    for (const path of [SYNC, LIST, "/api/v1/conversations/conv-0001"])
      expect(api.handles(path)).toBe(false);
  });

  test("every route needs an owner: 401 and the store is never reached", async () => {
    const { api, calls } = setup();
    for (const [path, method, catalogue, init] of [
      [SYNC, "post", SYNC, push({ conversations: [] }, {})],
      [SYNC, "get", SYNC, undefined],
      [LIST, "get", LIST, undefined],
      ["/api/v1/conversations/conv-0001", "get", DETAIL, undefined],
    ] as const) {
      await expectApiError(await api.request(path, init), {
        path: catalogue,
        method,
        status: 401,
        code: "unauthenticated",
      });
    }
    expect(calls).toEqual([]);
  });
});

describe("sync group: push and pull", () => {
  test("push forwards the owner's batch and answers the store result, no-store", async () => {
    const { api, calls } = setup();
    const conversation = conversationRecord("conv-0001");
    const message = messageRecord("msg-0001", "conv-0001");
    const res = await api.request(
      SYNC,
      push({ deviceId: "laptop", conversations: [conversation], messages: [message] }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(SyncPushResponse.parse(await res.json()).accepted).toEqual(["conv-0001", "msg-0001"]);
    expect(calls).toEqual([
      ["push", "alice", { conversations: [conversation], messages: [message] }],
    ]);
    // Absent lists default to [].
    await api.request(SYNC, push({}, BOB));
    expect(calls[1]).toEqual(["push", "bob", { conversations: [], messages: [] }]);
  });

  test("push validation: JSON body, at most 500 records per list", async () => {
    const { api, calls } = setup();
    const notJson = await api.request(SYNC, {
      method: "POST",
      headers: ALICE,
      body: "conversations=1",
    });
    expect(
      (await expectApiError(notJson, { path: SYNC, method: "post", status: 400 })).message,
    ).toBe("body must be JSON");
    const tooMany = await api.request(
      SYNC,
      push({ messages: Array.from({ length: 501 }, () => ({})) }),
    );
    expect(
      (
        await expectApiError(tooMany, {
          path: SYNC,
          method: "post",
          status: 400,
          code: "invalid_request",
        })
      ).message,
    ).toContain("messages");
    expect(calls).toEqual([]);
  });

  test("pull: cursor and coerced limit reach the store; the answer is a SyncPullResponse", async () => {
    const { api, calls } = setup();
    const res = await api.request(`${SYNC}?cursor=c1&limit=50`, { headers: ALICE });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(SyncPullResponse.parse(await res.json()).cursor).toBe("c2");
    await api.request(SYNC, { headers: BOB });
    expect(calls).toEqual([
      ["pull", "alice", "c1", 50],
      ["pull", "bob", null, undefined],
    ]);
  });

  test("pull validation: limit 1..1000, cursor ≤ 16 chars; a malformed cursor → 400", async () => {
    const { api, calls } = setup();
    for (const query of ["limit=0", "limit=1001", "limit=abc", `cursor=${"c".repeat(17)}`]) {
      await expectApiError(await api.request(`${SYNC}?${query}`, { headers: ALICE }), {
        path: SYNC,
        method: "get",
        status: 400,
        code: "invalid_request",
      });
    }
    expect(calls).toEqual([]);
    const bad = await api.request(`${SYNC}?cursor=zz`, { headers: ALICE });
    expect(
      await expectApiError(bad, {
        path: SYNC,
        method: "get",
        status: 400,
        code: "invalid_request",
      }),
    ).toEqual({ error: "invalid sync cursor", code: "invalid_request" });
  });

  test("store failure → 503 pg_unavailable without the cause", async () => {
    const { api } = setup({ fail: "password authentication failed for user chat" });
    for (const [path, method, catalogue, init] of [
      [SYNC, "post", SYNC, push({})],
      [SYNC, "get", SYNC, { headers: ALICE }],
      [LIST, "get", LIST, { headers: ALICE }],
      ["/api/v1/conversations/conv-0001", "get", DETAIL, { headers: ALICE }],
    ] as const) {
      const body = await expectApiError(await api.request(path, init), {
        path: catalogue,
        method,
        status: 503,
        code: "pg_unavailable",
      });
      expect(JSON.stringify(body)).not.toContain("password");
    }
  });

  test("sync routes spend the public budget per client IP", async () => {
    const limiter = countingRateLimit(1);
    const fake = fakeConversationStore();
    const api = createShenronApi(
      basePorts({ conversations: fake.store, rateLimit: limiter.port }),
      { service: "shenron-desktop" },
    );
    const headers = { ...ALICE, "x-real-ip": "192.0.2.50" };
    expect((await api.request(SYNC, { headers })).status).toBe(200);
    await expectApiError(await api.request(SYNC, { headers }), {
      path: SYNC,
      method: "get",
      status: 429,
      code: "rate_limited",
    });
    expect(limiter.keys).toEqual(["public:192.0.2.50", "public:192.0.2.50"]);
  });
});

describe("conversations", () => {
  test("list and detail of the owner's conversations, never cached", async () => {
    const { api, calls } = setup();
    const list = await api.request(LIST, { headers: ALICE });
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(list.headers.get("etag")).toBeNull();
    expect(ConversationListResponse.parse(await list.json()).conversations).toHaveLength(1);
    const detail = await api.request("/api/v1/conversations/conv-0001", { headers: BOB });
    expect(ConversationDetail.parse(await detail.json()).messages).toHaveLength(1);
    expect(calls).toEqual([
      ["list", "alice"],
      ["get", "bob", "conv-0001"],
    ]);
  });

  test("unknown conversation → 404; malformed id → 400", async () => {
    const { api } = setup();
    const missing = await api.request("/api/v1/conversations/conv-9999", { headers: ALICE });
    expect(await expectApiError(missing, { path: DETAIL, method: "get", status: 404 })).toEqual({
      error: "Not found",
    });
    for (const id of ["short", "bad%20id%20with%20spaces", "x".repeat(65)]) {
      await expectApiError(await api.request(`/api/v1/conversations/${id}`, { headers: ALICE }), {
        path: DETAIL,
        method: "get",
        status: 400,
        code: "invalid_request",
      });
    }
  });
});
