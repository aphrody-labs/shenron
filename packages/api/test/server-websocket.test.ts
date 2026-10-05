// SPDX-License-Identifier: Apache-2.0
/**
 * WebSocket group over a real `Bun.serve` bound to 127.0.0.1 on an ephemeral port: the chat
 * engine, the auth and the rate limiter are simulated, nothing else is reached.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  CHAT_RATE_LIMIT,
  createShenronApi,
  type ChatSocketData,
  type ShenronApiPorts,
} from "../src/server";
import {
  ALICE,
  basePorts,
  countingRateLimit,
  deltaEvent,
  doneEvent,
  expectApiError,
  metaEvent,
  parseSse,
  scriptedChat,
} from "./support/ports";

const WS_PATH = "/api/v1/chat/ws";
type Message = { id?: number; streamId?: string; type: string; data?: Record<string, unknown> };

const servers: { stop(force?: boolean): unknown }[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

function serve(over: Partial<ShenronApiPorts> = {}) {
  const chat = scriptedChat();
  const api = createShenronApi(basePorts({ chat: chat.port, ...over }), {
    service: "shenron-server",
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    routes: api.routes,
    websocket: api.websocket,
    fetch: (request: Request, srv: Bun.Server<ChatSocketData>) => api.fetch(request, srv),
  } as unknown as Bun.Serve.Options<ChatSocketData>);
  servers.push(server);
  return { api, chat, server, http: `http://127.0.0.1:${server.port}` };
}

/** Wait until `check()` holds, polling the event loop (real timers). */
async function eventually(check: () => boolean, what: string, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(5);
  }
}

async function connect(port: number, headers: Record<string, string> = ALICE) {
  // Bun extension: upgrade request headers (the DOM overload only knows protocols).
  const options: Bun.WebSocketOptions = { headers };
  const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`, options as never);
  const messages: Message[] = [];
  ws.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data))));
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket refused")), { once: true });
  });
  return {
    ws,
    messages,
    send: (message: unknown) =>
      ws.send(typeof message === "string" ? message : JSON.stringify(message)),
    until: (check: (all: Message[]) => boolean, what: string) =>
      eventually(() => check(messages), what),
  };
}

const chatMessage = (message = "Qui est Goku ?") => ({ type: "chat", request: { message } });

describe("WebSocket upgrade", () => {
  test("an authenticated upgrade opens the socket", async () => {
    const { server } = serve();
    const client = await connect(server.port!);
    expect(client.ws.readyState).toBe(WebSocket.OPEN);
    client.ws.close();
  });

  test("refused without an owner: 401 envelope, the socket never opens", async () => {
    const { server, http } = serve();
    await expectApiError(
      await fetch(`${http}${WS_PATH}`, {
        headers: { connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13" },
      }),
      { path: WS_PATH, method: "get", status: 401, code: "unauthenticated" },
    );
    await expect(connect(server.port!, {})).rejects.toThrow("WebSocket refused");
  });

  test("a plain GET cannot be upgraded (400); an embedding host without Bun.serve → 426", async () => {
    const { api, http } = serve();
    await expectApiError(await fetch(`${http}${WS_PATH}`, { headers: ALICE }), {
      path: WS_PATH,
      method: "get",
      status: 400,
      code: "invalid_request",
    });
    expect(
      await expectApiError(await api.request(WS_PATH, { headers: ALICE }), {
        path: WS_PATH,
        method: "get",
        status: 426,
      }),
    ).toEqual({ error: "WebSocket needs Bun.serve", code: "invalid_request" });
  });
});

describe("WebSocket messages", () => {
  test("chat: the generation's events arrive numbered, tagged with the stream id", async () => {
    const { server, chat } = serve();
    const client = await connect(server.port!);
    client.send(chatMessage());
    await eventually(() => chat.runs.length === 1, "the generation");
    const run = chat.runs[0]!;
    expect(run.input.ownerId).toBe("alice");
    expect(run.input.request.surface).toBe("site");
    const streamId = run.input.streamId;
    run.push(metaEvent(streamId), deltaEvent("Son Goku"), doneEvent());
    run.end();
    await client.until((all) => all.length === 3, "three events");
    expect(client.messages.map((m) => [m.id, m.streamId, m.type])).toEqual([
      [1, streamId, "meta"],
      [2, streamId, "delta"],
      [3, streamId, "done"],
    ]);
    expect(client.messages[1]!.data).toEqual({ text: "Son Goku" });
    client.ws.close();
  });

  test("malformed frames, invalid requests and unknown types → error frames, no generation", async () => {
    const { server, chat } = serve();
    const client = await connect(server.port!);
    client.send("{not json");
    client.send({ type: "chat", request: { message: "" } });
    client.send({ type: "subscribe" });
    client.send({ type: "resume" });
    await client.until((all) => all.length === 4, "four errors");
    expect(client.messages.map((m) => [m.type, m.data?.code, m.data?.retryable])).toEqual([
      ["error", "invalid_request", false],
      ["error", "invalid_request", false],
      ["error", "invalid_request", false],
      ["error", "invalid_request", false],
    ]);
    expect(client.messages[0]!.data?.message).toBe("frames are JSON");
    expect(client.messages[1]!.data?.message).toContain("message");
    expect(client.messages[2]!.data?.message).toBe("type must be chat, resume or cancel");
    expect(chat.runs).toHaveLength(0);
    client.ws.close();
  });

  test("resume: replay after `after`, then the live tail; unknown or foreign stream → not_found", async () => {
    const { server, chat } = serve();
    const first = await connect(server.port!);
    first.send(chatMessage());
    await eventually(() => chat.runs.length === 1, "the generation");
    const run = chat.runs[0]!;
    const streamId = run.input.streamId;
    run.push(metaEvent(streamId), deltaEvent("a"));
    await first.until((all) => all.length === 2, "two events");
    first.ws.close();

    const second = await connect(server.port!);
    second.send({ type: "resume", streamId, after: 1 });
    await second.until((all) => all.length === 1, "the replay");
    run.push(doneEvent());
    run.end();
    await second.until((all) => all.length === 2, "the live tail");
    expect(second.messages.map((m) => m.id)).toEqual([2, 3]);

    second.send({ type: "resume", streamId: "s0000404" });
    await second.until((all) => all.length === 3, "not_found");
    expect(second.messages[2]).toEqual({
      type: "error",
      streamId: "s0000404",
      data: { code: "not_found", message: "unknown stream", retryable: false },
    });
    const intruder = await connect(server.port!, { "x-test-owner": "bob" });
    intruder.send({ type: "resume", streamId });
    await intruder.until((all) => all.length === 1, "not_found");
    expect(intruder.messages[0]!.data?.code).toBe("not_found");
    second.ws.close();
    intruder.ws.close();
  });

  test("closing the socket stops the relay; the generation survives for an SSE resume", async () => {
    const { server, chat, http } = serve();
    const client = await connect(server.port!);
    client.send(chatMessage());
    await eventually(() => chat.runs.length === 1, "the generation");
    const run = chat.runs[0]!;
    run.push(metaEvent(run.input.streamId));
    await client.until((all) => all.length === 1, "meta");
    client.ws.close();
    await eventually(() => client.ws.readyState === WebSocket.CLOSED, "the close");
    run.push(deltaEvent("b"), doneEvent());
    run.end();
    expect(run.signal.aborted).toBe(false);
    const resumed = await fetch(`${http}/api/v1/chat/streams/${run.input.streamId}`, {
      headers: { ...ALICE, "last-event-id": "1" },
    });
    expect(parseSse(await resumed.text()).map((f) => [f.id, f.event])).toEqual([
      ["2", "delta"],
      ["3", "done"],
    ]);
    expect(client.messages).toHaveLength(1);
  });

  test("cancel aborts the owner's generation only", async () => {
    const { server, chat } = serve();
    const client = await connect(server.port!);
    client.send(chatMessage());
    await eventually(() => chat.runs.length === 1, "the generation");
    const run = chat.runs[0]!;
    const intruder = await connect(server.port!, { "x-test-owner": "bob" });
    intruder.send({ type: "cancel", streamId: run.input.streamId });
    await Bun.sleep(20);
    expect(run.signal.aborted).toBe(false);
    client.send({ type: "cancel", streamId: run.input.streamId });
    await eventually(() => run.signal.aborted, "the abort");
    client.ws.close();
    intruder.ws.close();
  });

  // Regression: a second resume of a stream on the same socket started a second relay, so
  // every later event arrived twice and closing the socket left one relay running.
  test("a second resume on the same socket replaces the relay: no duplicate event", async () => {
    const { server, chat } = serve();
    const client = await connect(server.port!);
    client.send(chatMessage());
    await eventually(() => chat.runs.length === 1, "the generation");
    const run = chat.runs[0]!;
    const streamId = run.input.streamId;
    run.push(metaEvent(streamId), deltaEvent("a"));
    await client.until((all) => all.length === 2, "two events");
    client.send({ type: "resume", streamId, after: 0 });
    await client.until((all) => all.length === 4, "the replay");
    run.push(deltaEvent("b"), doneEvent());
    run.end();
    await client.until((all) => all.some((m) => m.type === "done"), "done");
    await Bun.sleep(20);
    expect(client.messages.map((m) => m.id)).toEqual([1, 2, 1, 2, 3, 4]);
    client.ws.close();
  });
});

describe("WebSocket rate limit", () => {
  // Regression: generations started over the socket escaped the chat budget of POST /api/v1/chat.
  test("each chat message spends the chat budget of the upgrade's client IP", async () => {
    const limiter = countingRateLimit(1);
    const { server, chat } = serve({ rateLimit: limiter.port });
    const client = await connect(server.port!, { ...ALICE, "x-real-ip": "192.0.2.33" });
    expect(limiter.keys).toEqual(["public:192.0.2.33"]);
    limiter.keys.length = 0;
    client.send(chatMessage("one"));
    await eventually(() => chat.runs.length === 1, "the first generation");
    client.send(chatMessage("two"));
    await client.until((all) => all.some((m) => m.type === "error"), "rate_limited");
    expect(client.messages.at(-1)).toEqual({
      type: "error",
      data: {
        code: "rate_limited",
        message: `Rate limit (${CHAT_RATE_LIMIT.limit}/min)`,
        retryable: true,
      },
    });
    expect(chat.runs).toHaveLength(1);
    expect(limiter.keys).toEqual(["chat:192.0.2.33", "chat:192.0.2.33"]);
    client.ws.close();
  });

  test("a direct loopback socket is exempt, like the HTTP routes", async () => {
    const limiter = countingRateLimit(0);
    const { server, chat } = serve({
      rateLimit: limiter.port,
      isDirectLoopback: (request) => request.headers.get("x-test-loopback") === "1",
    });
    const client = await connect(server.port!, { ...ALICE, "x-test-loopback": "1" });
    client.send(chatMessage());
    await eventually(() => chat.runs.length === 1, "the generation");
    expect(limiter.keys).toEqual([]);
    client.ws.close();
  });
});
