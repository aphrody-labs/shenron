// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, jest, test } from "bun:test";
import { ChatResponse, ModelsResponse } from "../src/contract";
import { createShenronApi, type ShenronApiPorts } from "../src/server";
import { SSE_KEEPALIVE_MS } from "../src/server";
import {
  ALICE,
  BOB,
  MODELS,
  basePorts,
  countingRateLimit,
  deltaEvent,
  doneEvent,
  expectApiError,
  metaEvent,
  parseSse,
  readFrames,
  scriptedChat,
  settle,
} from "./support/ports";

const CHAT = "/api/v1/chat";
const resumePath = (id: string) => `/api/v1/chat/streams/${id}`;
const cancelPath = (id: string) => `/api/v1/chat/streams/${id}/cancel`;
const OWNER_ROUTES = [
  { method: "post", path: CHAT, catalogue: CHAT },
  { method: "get", path: resumePath("s0000001"), catalogue: "/api/v1/chat/streams/{streamId}" },
  {
    method: "post",
    path: cancelPath("s0000001"),
    catalogue: "/api/v1/chat/streams/{streamId}/cancel",
  },
  { method: "get", path: "/api/v1/chat/ws", catalogue: "/api/v1/chat/ws" },
] as const;

function setup(over: Partial<ShenronApiPorts> = {}) {
  const chat = scriptedChat();
  const api = createShenronApi(basePorts({ chat: chat.port, ...over }), {
    service: "shenron-server",
  });
  return { api, chat };
}

function post(body: unknown, headers: Record<string, string> = ALICE): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

/** Starts a streamed chat; returns its id, its run and the SSE reader. */
async function startStream(
  api: ReturnType<typeof setup>["api"],
  chat: ReturnType<typeof setup>["chat"],
) {
  const res = await api.request(CHAT, post({ message: "Qui est Goku ?" }));
  expect(res.status).toBe(200);
  const id = res.headers.get("x-stream-id")!;
  return { res, id, run: chat.runs.at(-1)!, reader: res.body!.getReader() };
}

afterEach(() => jest.useRealTimers());

describe("chat group: routing and authentication", () => {
  test("only the catalogue methods are served; OPTIONS answers the chat CORS headers", async () => {
    const { api } = setup();
    for (const [method, path] of [
      ["GET", CHAT],
      ["PUT", CHAT],
      ["POST", resumePath("s0000001")],
      ["GET", cancelPath("s0000001")],
      ["POST", "/api/v1/chat/ws"],
    ] as const) {
      const res = await api.request(path, { method, headers: ALICE });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    const options = await api.request(CHAT, {
      method: "OPTIONS",
      headers: { origin: "https://dragonballfr.com" },
    });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization, Last-Event-ID, X-Shenron-Owner",
    );
    expect(options.headers.get("access-control-expose-headers")).toBe("X-Stream-Id, ETag");
    expect(api.handles(CHAT)).toBe(true);
    expect(api.handles("/api/v1/models")).toBe(true);
  });

  test("without the chat port the group claims nothing", async () => {
    const api = createShenronApi(basePorts({ vfs: null }), { service: "shenron-server" });
    for (const path of [CHAT, resumePath("s0000001"), "/api/v1/chat/ws", "/api/v1/models"])
      expect(api.handles(path)).toBe(false);
  });

  test("every owner route answers 401 unauthenticated without an owner, before validation", async () => {
    const { api, chat } = setup();
    for (const route of OWNER_ROUTES) {
      const init =
        route.method === "post"
          ? { method: "POST", body: "not json", headers: { "content-type": "application/json" } }
          : undefined;
      await expectApiError(await api.request(route.path, init), {
        path: route.catalogue,
        method: route.method,
        status: 401,
        code: "unauthenticated",
      });
    }
    // No auth port at all: same answer.
    const bare = createShenronApi(basePorts({ chat: chat.port, auth: null }), {
      service: "shenron-server",
    });
    await expectApiError(await bare.request(CHAT, post({ message: "x" })), {
      path: CHAT,
      method: "post",
      status: 401,
      code: "unauthenticated",
    });
    expect(chat.runs).toHaveLength(0);
  });

  test("invalid bodies and stream ids → 400 invalid_request", async () => {
    const { api, chat } = setup();
    const notJson = await api.request(CHAT, { method: "POST", headers: ALICE, body: "{" });
    expect(
      (await expectApiError(notJson, { path: CHAT, method: "post", status: 400 })).message,
    ).toBe("body must be JSON");
    const empty = await api.request(CHAT, post({ message: "   " }));
    expect(
      (await expectApiError(empty, { path: CHAT, method: "post", status: 400 })).message,
    ).toContain("message");
    const tooMany = await api.request(CHAT, post({ message: "x", topK: 99 }));
    await expectApiError(tooMany, { path: CHAT, method: "post", status: 400 });
    const badId = await api.request(resumePath("bad"), { headers: ALICE });
    await expectApiError(badId, {
      path: "/api/v1/chat/streams/{streamId}",
      method: "get",
      status: 400,
      code: "invalid_request",
    });
    expect(chat.runs).toHaveLength(0);
  });
});

describe("chat group: SSE", () => {
  test("POST /api/v1/chat streams numbered frames with the SSE headers", async () => {
    const { api, chat } = setup();
    const { res, id, run, reader } = await startStream(api, chat);
    expect(id).toMatch(/^s[0-9a-f]{32}$/);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("access-control-expose-headers")).toBe("X-Stream-Id, ETag");
    expect(run.input).toMatchObject({ ownerId: "alice", streamId: id });
    expect(run.input.request).toMatchObject({
      message: "Qui est Goku ?",
      stream: true,
      surface: "site",
    });
    run.push(metaEvent(id), deltaEvent("Son "), deltaEvent("Goku"), doneEvent());
    run.end();
    const frames = await readFrames(reader, () => false);
    expect(frames.map((f) => [f.id, f.event])).toEqual([
      ["1", "meta"],
      ["2", "delta"],
      ["3", "delta"],
      ["4", "done"],
    ]);
    expect(frames[1]!.data).toEqual({ text: "Son " });
  });

  test(`a keepalive comment is written every ${SSE_KEEPALIVE_MS / 1000} s while the stream is idle`, async () => {
    jest.useFakeTimers();
    const { api, chat } = setup();
    const { id, run, reader } = await startStream(api, chat);
    run.push(metaEvent(id));
    const state = { text: "" };
    await readFrames(reader, (frames) => frames.length === 1, state);
    jest.advanceTimersByTime(SSE_KEEPALIVE_MS);
    const frames = await readFrames(reader, (all) => all.length === 2, state);
    expect(frames[1]).toEqual({ comment: "keepalive" });
    expect(state.text.endsWith(": keepalive\n\n")).toBe(true);
    run.push(doneEvent());
    run.end();
    const rest = await readFrames(reader, () => false, state);
    expect(rest.map((f) => f.event ?? f.comment)).toEqual(["meta", "keepalive", "done"]);
    // The stream is over: no keepalive is written any more.
    jest.advanceTimersByTime(SSE_KEEPALIVE_MS * 3);
    expect(parseSse(state.text)).toHaveLength(3);
  });

  test("resume: Last-Event-ID (or ?after=) replays what follows, then the live tail", async () => {
    const { api, chat } = setup();
    const { id, run } = await startStream(api, chat);
    run.push(metaEvent(id), deltaEvent("a"), deltaEvent("b"));
    await settle();
    const resumed = await api.request(resumePath(id), {
      headers: { ...ALICE, "last-event-id": "2" },
    });
    expect(resumed.status).toBe(200);
    expect(resumed.headers.get("x-stream-id")).toBe(id);
    expect(resumed.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    const reader = resumed.body!.getReader();
    const state = { text: "" };
    expect((await readFrames(reader, (f) => f.length === 1, state)).map((f) => f.id)).toEqual([
      "3",
    ]);
    run.push(doneEvent());
    run.end();
    expect((await readFrames(reader, () => false, state)).map((f) => f.id)).toEqual(["3", "4"]);
    // ?after= when there is no header; the header wins over the query.
    const byQuery = await api.request(`${resumePath(id)}?after=1`, { headers: ALICE });
    expect(parseSse(await byQuery.text()).map((f) => f.id)).toEqual(["2", "3", "4"]);
    const both = await api.request(`${resumePath(id)}?after=1`, {
      headers: { ...ALICE, "last-event-id": "3" },
    });
    expect(parseSse(await both.text()).map((f) => f.id)).toEqual(["4"]);
    const garbage = await api.request(`${resumePath(id)}?after=-5`, { headers: ALICE });
    expect(parseSse(await garbage.text()).map((f) => f.id)).toEqual(["1", "2", "3", "4"]);
  });

  test("resume of an unknown stream or of another owner's stream → 404", async () => {
    const { api, chat } = setup();
    const { id, run } = await startStream(api, chat);
    run.push(metaEvent(id));
    for (const [path, headers] of [
      [resumePath(id), BOB],
      [resumePath("s0000404"), ALICE],
    ] as const) {
      await expectApiError(await api.request(path, { headers }), {
        path: "/api/v1/chat/streams/{streamId}",
        method: "get",
        status: 404,
      });
    }
  });

  // Regression: a dropped body (client gone, HEAD) left its follower and keepalive running
  // until the generation ended.
  test("a cancelled body or a HEAD resume stops its follower while the generation runs on", async () => {
    const { api, chat } = setup();
    const finished: string[] = [];
    const follow = api.streams.follow.bind(api.streams);
    api.streams.follow = async function* (...args: Parameters<typeof follow>) {
      try {
        yield* follow(...args);
      } finally {
        finished.push(args[2] === 0 ? "live" : `after:${args[2]}`);
      }
    };
    const { id, run, reader } = await startStream(api, chat);
    run.push(metaEvent(id));
    await readFrames(reader, (f) => f.length === 1);
    await reader.cancel();
    await settle();
    expect(finished).toEqual(["live"]);
    const head = await api.request(resumePath(id), {
      method: "HEAD",
      headers: { ...ALICE, "last-event-id": "1" },
    });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(await head.text()).toBe("");
    await settle();
    expect(finished).toEqual(["live", "after:1"]);
    expect(run.signal.aborted).toBe(false);
  });
});

describe("chat group: non-streaming answer, cancel, models", () => {
  test("stream: false → one JSON ChatResponse", async () => {
    const { api, chat } = setup();
    const pending = api.request(CHAT, post({ message: "Qui est Goku ?", stream: false }));
    await settle();
    const run = chat.runs[0]!;
    run.push(
      metaEvent(run.input.streamId),
      { type: "tool", data: { name: "dragonball.wiki", ok: true, ms: 2, hits: 1 } },
      deltaEvent("Son "),
      deltaEvent("Goku"),
      doneEvent(),
    );
    run.end();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = ChatResponse.parse(await res.json());
    expect(body.answer).toBe("Son Goku");
    expect(body.tools).toEqual([{ name: "dragonball.wiki", ok: true, ms: 2, hits: 1 }]);
    expect(body.done.finishReason).toBe("stop");
  });

  test("stream: false and an error event → 502 upstream_unavailable", async () => {
    const { api, chat } = setup();
    const pending = api.request(CHAT, post({ message: "x", stream: false }));
    await settle();
    const run = chat.runs[0]!;
    run.push({
      type: "error",
      data: { code: "backend_failed", message: "every backend failed", retryable: true },
    });
    run.end();
    const body = await expectApiError(await pending, {
      path: CHAT,
      method: "post",
      status: 502,
      code: "upstream_unavailable",
    });
    expect(body.message).toBe("backend_failed: every backend failed");
  });

  // Regression: the catalogue declares no body for the cancel, but the server demanded one.
  test("cancel: POST without a body aborts the owner's generation; then 404", async () => {
    const { api, chat } = setup();
    const { id, run } = await startStream(api, chat);
    run.push(metaEvent(id));
    const path = "/api/v1/chat/streams/{streamId}/cancel";
    await expectApiError(await api.request(cancelPath(id), { method: "POST", headers: BOB }), {
      path,
      method: "post",
      status: 404,
    });
    expect(run.signal.aborted).toBe(false);
    const cancelled = await api.request(cancelPath(id), { method: "POST", headers: ALICE });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ ok: true });
    expect(cancelled.headers.get("cache-control")).toBe("no-store");
    expect(run.signal.aborted).toBe(true);
    await settle();
    // Finished: nothing left to cancel. A JSON body is still accepted.
    await expectApiError(await api.request(cancelPath(id), post({})), {
      path,
      method: "post",
      status: 404,
    });
  });

  test("models: public, cached 10 s with an ETag and 304", async () => {
    let calls = 0;
    const chat = scriptedChat(async () => {
      calls++;
      return MODELS;
    });
    const api = createShenronApi(basePorts({ chat: chat.port }), { service: "shenron-site" });
    const first = await api.request("/api/v1/models");
    expect(first.status).toBe(200);
    expect(ModelsResponse.parse(await first.json())).toEqual(MODELS);
    expect(first.headers.get("cache-control")).toBe(
      "public, max-age=10, s-maxage=20, stale-while-revalidate=40",
    );
    const etag = first.headers.get("etag")!;
    const second = await api.request("/api/v1/models", { headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
    expect(calls).toBe(1);
  });

  // Regression: an engine failure was reported as 503 pg_unavailable ("Data store unavailable").
  test("models: a failing backend probe → 502 upstream_unavailable, cause withheld, not cached", async () => {
    const chat = scriptedChat(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:8080");
    });
    const api = createShenronApi(basePorts({ chat: chat.port }), { service: "shenron-site" });
    for (let i = 0; i < 2; i++) {
      const body = await expectApiError(await api.request("/api/v1/models"), {
        path: "/api/v1/models",
        method: "get",
        status: 502,
        code: "upstream_unavailable",
      });
      expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    }
  });
});

describe("chat group: rate limits", () => {
  test("POST /api/v1/chat spends the chat budget (20/min per IP), loopback exempt", async () => {
    const { api } = setup();
    const headers = { ...ALICE, "x-real-ip": "198.51.100.20" };
    for (let i = 0; i < 20; i++)
      expect((await api.request(CHAT, post({ message: `q${i}` }, headers))).status).toBe(200);
    const limited = await api.request(CHAT, post({ message: "q21" }, headers));
    await expectApiError(limited, {
      path: CHAT,
      method: "post",
      status: 429,
      code: "rate_limited",
    });
    expect(limited.headers.get("retry-after")).toBe("60");
    const loopback = await api.request(
      CHAT,
      post({ message: "q22" }, { ...headers, "x-test-loopback": "1" }),
    );
    expect(loopback.status).toBe(200);
  });

  test("budget keys: chat:<ip> for generations, public:<ip> for resume and models", async () => {
    const limiter = countingRateLimit();
    const { api, chat } = setup({ rateLimit: limiter.port });
    const headers = { ...ALICE, "x-real-ip": "192.0.2.9" };
    await api.request(CHAT, post({ message: "x" }, headers));
    const id = chat.runs[0]!.input.streamId;
    await api.request(resumePath(id), { headers, method: "HEAD" });
    await api.request("/api/v1/models", { headers });
    expect(limiter.keys).toEqual(["chat:192.0.2.9", "public:192.0.2.9", "public:192.0.2.9"]);
  });
});
