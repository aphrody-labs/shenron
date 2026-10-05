// SPDX-License-Identifier: Apache-2.0
// Typed SSE chat stream of `@shenron/api/client`: framing, validation, resumption, fallbacks,
// and an end-to-end run against the native server with a scripted chat engine.
import { describe, expect, test } from "bun:test";
import {
  cancelChat,
  createSseParser,
  parseChatEvent,
  resumeChat,
  streamChat,
  type ChatStreamOptions,
} from "../src/client";
import type { ChatEvent } from "../src/contract";
import { createShenronApi } from "../src/server";
import {
  ALICE,
  basePorts,
  deltaEvent,
  doneEvent,
  metaEvent,
  scriptedChat,
  settle,
} from "./support/ports";

const BASE = "http://127.0.0.1:4310";
const encoder = new TextEncoder();
const frame = (n: number, event: ChatEvent) =>
  `id: ${n}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

/** A body that emits `chunks` then either ends or errors (a dropped connection). */
function body(chunks: string[], end: "close" | "drop" = "close") {
  const queue = [...chunks];
  return new ReadableStream<Uint8Array>({
    // Pull-based: `error()` in `start` would discard the chunks still queued.
    pull(controller) {
      const next = queue.shift();
      if (next !== undefined) controller.enqueue(encoder.encode(next));
      else if (end === "close") controller.close();
      else controller.error(new TypeError("network connection lost"));
    },
  });
}

const sse = (chunks: string[], end: "close" | "drop" = "close", streamId = "s0000000001") =>
  new Response(body(chunks, end), {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "x-stream-id": streamId },
  });

const drop = () => sse([frame(1, deltaEvent("a"))], "drop");
const net = (): Response => {
  throw new TypeError("offline");
};

type Call = { method: string; url: string; headers: Headers; body?: string };

function scriptedFetch(responses: Array<(call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new TypeError("no scripted response left");
    return next(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const options = (fetch: typeof globalThis.fetch, extra: Partial<ChatStreamOptions> = {}) => {
  const events: Array<[ChatEvent["type"], number]> = [];
  const text: string[] = [];
  return {
    events,
    text,
    opts: {
      baseUrl: BASE,
      fetch,
      resumeDelayMs: () => 0,
      onEvent: (event: ChatEvent, id: number) => {
        events.push([event.type, id]);
        if (event.type === "delta") text.push(event.data.text);
      },
      ...extra,
    } satisfies ChatStreamOptions,
  };
};

describe("createSseParser", () => {
  test("frames split anywhere, CRLF, comments, multi-line data", () => {
    const parser = createSseParser();
    const raw =
      ': keepalive\r\n\r\nid: 1\r\nevent: delta\r\ndata: {"text":\r\ndata: "Go"}\r\n\r\nid: 2\nevent: done\ndata: x\n\n';
    const frames = [];
    for (const char of raw) frames.push(...parser.push(char));
    frames.push(...parser.flush());
    expect(frames).toEqual([
      { event: "delta", data: '{"text":\n"Go"}', id: "1" },
      { event: "done", data: "x", id: "2" },
    ]);
  });

  test("a frame without data is not dispatched; a trailing frame is flushed", () => {
    const parser = createSseParser();
    expect(parser.push("event: ping\n\nretry: 10\n\ndata: tail")).toEqual([]);
    expect(parser.flush()).toEqual([{ event: "message", data: "tail" }]);
  });
});

describe("parseChatEvent", () => {
  test("validates against the contract", () => {
    expect(parseChatEvent({ event: "delta", data: '{"text":"Kame"}' })).toEqual(deltaEvent("Kame"));
    expect(parseChatEvent({ event: "delta", data: '{"text":3}' })).toBeNull();
    expect(parseChatEvent({ event: "delta", data: "{" })).toBeNull();
    expect(parseChatEvent({ event: "toString", data: "{}" })).toBeNull();
    const done = doneEvent();
    expect(parseChatEvent({ event: "done", data: JSON.stringify(done.data) })).toEqual(done);
  });
});

describe("streamChat over a simulated SSE", () => {
  test("posts the contract request and delivers the events in order", async () => {
    const { fetch, calls } = scriptedFetch([
      () =>
        sse([
          frame(1, metaEvent("s0000000001")),
          frame(2, deltaEvent("Son ")),
          ": keepalive\n\n",
          frame(3, deltaEvent("Goku")),
          frame(4, doneEvent()),
        ]),
    ]);
    const streams: string[] = [];
    const { opts, events, text } = options(fetch, {
      headers: () => ({ "x-test-owner": "alice" }),
      onStream: (id) => streams.push(id),
    });
    const outcome = await streamChat({ message: "Qui est Goku ?", persona: "whis" }, opts);
    expect(outcome).toMatchObject({ ok: true, streamId: "s0000000001", resumes: 0 });
    expect(streams).toEqual(["s0000000001"]);
    expect(text.join("")).toBe("Son Goku");
    expect(events.map(([type]) => type)).toEqual(["meta", "delta", "delta", "done"]);
    expect(calls[0]).toMatchObject({ method: "POST", url: `${BASE}/api/v1/chat` });
    expect(calls[0]?.headers.get("accept")).toBe("text/event-stream");
    expect(calls[0]?.headers.get("x-test-owner")).toBe("alice");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      message: "Qui est Goku ?",
      persona: "whis",
      stream: true,
    });
  });

  test("a dropped connection resumes with Last-Event-ID and skips the replayed overlap", async () => {
    const { fetch, calls } = scriptedFetch([
      () => sse([frame(1, metaEvent("s0000000001")), frame(2, deltaEvent("Kame"))], "drop"),
      // The server replays from the cursor; a duplicate of 2 must not be delivered twice.
      () =>
        sse([frame(2, deltaEvent("Kame")), frame(3, deltaEvent("hameha")), frame(4, doneEvent())]),
    ]);
    const resumed: Array<[number, number]> = [];
    const { opts, text, events } = options(fetch, {
      onResume: (attempt, last) => resumed.push([attempt, last]),
    });
    const outcome = await streamChat({ message: "Kamehameha ?" }, opts);
    expect(outcome).toMatchObject({ ok: true, resumes: 1 });
    expect(text.join("")).toBe("Kamehameha");
    expect(events.map(([, id]) => id)).toEqual([1, 2, 3, 4]);
    expect(resumed).toEqual([[1, 2]]);
    expect(calls[1]).toMatchObject({
      method: "GET",
      url: `${BASE}/api/v1/chat/streams/s0000000001`,
    });
    expect(calls[1]?.headers.get("last-event-id")).toBe("2");
  });

  test("gives up after maxResumes, and on an expired stream", async () => {
    const first = scriptedFetch([drop, net, net]);
    expect(
      await streamChat({ message: "x" }, options(first.fetch, { maxResumes: 2 }).opts),
    ).toMatchObject({
      ok: false,
      kind: "unreachable",
      streamId: "s0000000001",
      lastEventId: 1,
    });
    expect(first.calls).toHaveLength(3);

    const expired = scriptedFetch([
      drop,
      () => Response.json({ error: "Not found" }, { status: 404 }),
    ]);
    expect(await streamChat({ message: "x" }, options(expired.fetch).opts)).toMatchObject({
      ok: false,
      kind: "unreachable",
      detail: "resume refused: HTTP 404",
    });
  });

  test("404 / 405 / non-SSE answer → unavailable (the caller falls back)", async () => {
    for (const response of [
      () =>
        new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } }),
      () => new Response(null, { status: 405 }),
      () => Response.json({ answer: "ok" }),
    ]) {
      const { fetch } = scriptedFetch([response]);
      expect((await streamChat({ message: "x" }, options(fetch).opts)).ok).toBe(false);
      const { fetch: again } = scriptedFetch([response]);
      expect(await streamChat({ message: "x" }, options(again).opts)).toMatchObject({
        kind: "unavailable",
      });
    }
  });

  test("refusals keep the envelope and Retry-After; error events end the stream", async () => {
    const limited = scriptedFetch([
      () =>
        Response.json(
          { error: "Rate limit (10/min)", code: "rate_limited" },
          { status: 429, headers: { "retry-after": "42" } },
        ),
    ]);
    expect(await streamChat({ message: "x" }, options(limited.fetch).opts)).toEqual({
      ok: false,
      kind: "http",
      status: 429,
      detail: "Rate limit (10/min)",
      error: { error: "Rate limit (10/min)", code: "rate_limited" },
      retryAfterSeconds: 42,
    });
    const failed = scriptedFetch([
      () =>
        sse([
          frame(1, {
            type: "error",
            data: { code: "backend", message: "no backend", retryable: true },
          }),
        ]),
    ]);
    expect(await streamChat({ message: "x" }, options(failed.fetch).opts)).toMatchObject({
      ok: false,
      kind: "error",
      error: { code: "backend", retryable: true },
    });
  });

  test("abort stops reading without resuming", async () => {
    const controller = new AbortController();
    const { fetch, calls } = scriptedFetch([
      () => {
        controller.abort();
        return sse([frame(1, deltaEvent("a"))], "drop");
      },
    ]);
    const outcome = await streamChat(
      { message: "x" },
      options(fetch, { signal: controller.signal }).opts,
    );
    expect(outcome).toMatchObject({ ok: false, kind: "aborted", lastEventId: 1 });
    expect(calls).toHaveLength(1);
  });
});

function serverSetup() {
  const chat = scriptedChat();
  const api = createShenronApi(basePorts({ chat: chat.port }), { service: "shenron-server" });
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    api.fetch(new Request(input, init))) as typeof globalThis.fetch;
  return { chat, fetch };
}

describe("streamChat against the native server", () => {
  test("stream, resume from a cursor and cancel through the contract routes", async () => {
    const { chat, fetch } = serverSetup();
    let streamId = "";
    const text: string[] = [];
    const running = streamChat(
      { message: "Qui est Vegeta ?" },
      {
        baseUrl: BASE,
        fetch,
        headers: ALICE,
        onStream: (id) => (streamId = id),
        onEvent: (event) => event.type === "delta" && text.push(event.data.text),
      },
    );
    await settle(20);
    const run = chat.runs.at(-1)!;
    run.push(metaEvent(streamId), deltaEvent("Prince "), deltaEvent("des Saiyans"), doneEvent());
    run.end();
    const outcome = await running;
    expect(outcome).toMatchObject({ ok: true, streamId });
    expect(text.join("")).toBe("Prince des Saiyans");
    expect(run.input.request.stream).toBe(true);

    // Another tab re-attaches after event 2: it receives 3 and 4 only.
    const replay: number[] = [];
    const resumed = await resumeChat(streamId, 2, {
      baseUrl: BASE,
      fetch,
      headers: ALICE,
      onEvent: (_, id) => replay.push(id),
    });
    expect(resumed).toMatchObject({ ok: true });
    expect(replay).toEqual([3, 4]);

    // Another owner cannot re-attach; a finished stream cannot be cancelled.
    expect(
      await resumeChat(streamId, 0, { baseUrl: BASE, fetch, headers: { "x-test-owner": "bob" } }),
    ).toMatchObject({ ok: false, kind: "http", status: 404 });
    expect(await cancelChat(streamId, { baseUrl: BASE, fetch, headers: ALICE })).toBe(false);
  });

  test("cancelChat stops a running generation", async () => {
    const { chat, fetch } = serverSetup();
    let streamId = "";
    const running = streamChat(
      { message: "x" },
      { baseUrl: BASE, fetch, headers: ALICE, onStream: (id) => (streamId = id) },
    );
    await settle(20);
    chat.runs.at(-1)!.push(deltaEvent("…"));
    await settle(20);
    expect(await cancelChat(streamId, { baseUrl: BASE, fetch, headers: ALICE })).toBe(true);
    expect(chat.runs.at(-1)!.signal.aborted).toBe(true);
    expect(await running).toMatchObject({ ok: false });
  });

  test("no chat port: the first request answers unavailable", async () => {
    const api = createShenronApi(basePorts(), { service: "shenron-site" });
    const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      api.fetch(new Request(input, init))) as typeof globalThis.fetch;
    expect(await streamChat({ message: "x" }, { baseUrl: BASE, fetch, headers: ALICE })).toEqual({
      ok: false,
      kind: "unavailable",
      status: 404,
    });
  });
});
