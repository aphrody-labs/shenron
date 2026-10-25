// SPDX-License-Identifier: MIT OR Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";

import {
  Channel,
  KOHARU_SESSION_HEADER,
  KoharuBridge,
  invoke,
  configureKoharuBridge,
  koharuBridge,
} from "../src/transport.ts";

const realFetch = globalThis.fetch;
const realEventSource = (globalThis as { EventSource?: unknown }).EventSource;

afterEach(() => {
  configureKoharuBridge("/api/local/koharu");
  globalThis.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
  (globalThis as { EventSource?: unknown }).EventSource = realEventSource;
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

test("hosted mode pins commands and channels to one same-origin authenticated bridge", async () => {
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
  const calls = fakeFetch(() => Response.json({ result: { name: "staff-project" } }));
  configureKoharuBridge("/api/studio", true);
  expect(koharuBridge().browserFiles).toBe(true);
  expect(await invoke("get_project")).toEqual({ name: "staff-project" });
  expect(calls[0]!.url).toBe("/api/studio/invoke");
  expect(FakeEventSource.last!.url).toStartWith("/api/studio/events?");
  expect(() => configureKoharuBridge("https://other.example/api/studio")).toThrow();
  expect(() => configureKoharuBridge("//other.example/api/studio")).toThrow();
  expect(() => configureKoharuBridge("/api/studio?token=private")).toThrow();
});

class FakeEventSource {
  static last: FakeEventSource | null = null;
  readonly listeners = new Map<string, (event: { data?: unknown }) => void>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, listener);
  }
  emit(value: unknown) {
    this.listeners.get("message")?.({ data: JSON.stringify(value) });
  }
  close() {
    this.closed = true;
  }
}

function fakeFetch(answer: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return answer(url, init ?? {});
  }) as typeof fetch;
  return calls;
}

describe("the local bridge", () => {
  test("posts the command with its session and channel tokens, and returns the result", async () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    const calls = fakeFetch(() => Response.json({ result: { name: "tome-1" } }));
    const bridge = new KoharuBridge("/api/local/koharu/");
    const received: unknown[] = [];
    const channel = bridge.register((message) => received.push(message));

    const result = await bridge.invoke("subscribe", { onCanvas: `__CHANNEL__:${channel}` });

    expect(result).toEqual({ name: "tome-1" });
    expect(calls[0]!.url).toBe("/api/local/koharu/invoke");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers[KOHARU_SESSION_HEADER]).toBe(bridge.session);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      command: "subscribe",
      args: { onCanvas: `__CHANNEL__:${channel}` },
    });
    expect(FakeEventSource.last!.url).toBe(
      `/api/local/koharu/events?session=${encodeURIComponent(bridge.session)}`,
    );

    FakeEventSource.last!.emit({ channel, message: { generation: 3 } });
    FakeEventSource.last!.emit({ channel, end: true });
    FakeEventSource.last!.emit({ channel, message: { generation: 4 } });
    expect(received).toEqual([{ generation: 3 }]);
  });

  test("returns byte results as an ArrayBuffer", async () => {
    fakeFetch(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    const bytes = await new KoharuBridge().invoke<ArrayBuffer>("get_thumbnail", { page: "p" });
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
  });

  test("rejects with the engine's error", async () => {
    fakeFetch(() => Response.json({ error: "no project is open" }, { status: 422 }));
    await expect(new KoharuBridge().invoke("get_pages")).rejects.toThrow("no project is open");
    fakeFetch(() => new Response("upstream down", { status: 502 }));
    await expect(new KoharuBridge().invoke("get_pages")).rejects.toThrow("HTTP 502");
  });
});

describe("outside Tauri", () => {
  test("channels and commands go through the page's bridge", async () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    const calls = fakeFetch(() => Response.json({ result: null }));
    const values: number[] = [];
    const channel = new Channel<number>((value) => values.push(value));
    expect(JSON.stringify({ onJob: channel })).toBe(`{"onJob":"__CHANNEL__:${channel.id}"}`);

    await invoke("cancel_agent", { run: "r" });
    expect(calls[0]!.url).toBe("/api/local/koharu/invoke");

    FakeEventSource.last!.emit({ channel: channel.id, message: 7 });
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- Protocol channels are not DOM event targets.
    channel.onmessage = (value) => values.push(value * 10);
    FakeEventSource.last!.emit({ channel: channel.id, message: 2 });
    expect(values).toEqual([7, 20]);
  });
});

describe("inside Tauri", () => {
  test("commands and channels are Tauri IPC", async () => {
    // @aphrody/api reaches Tauri through `window`.
    (globalThis as { window?: unknown }).window = globalThis;
    const invoked: { cmd: string; args: unknown }[] = [];
    const callbacks = new Map<number, (message: unknown) => void>();
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      transformCallback(callback: (message: unknown) => void) {
        const id = callbacks.size + 100;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
      invoke(cmd: string, args: unknown) {
        invoked.push({ cmd, args });
        return Promise.resolve("ok");
      },
    };
    const values: unknown[] = [];
    const channel = new Channel<string>((value) => values.push(value));
    expect(channel.id).toBe(100);
    expect(channel.toJSON()).toBe("__CHANNEL__:100");
    callbacks.get(100)!({ index: 0, message: "hello" });
    expect(values).toEqual(["hello"]);

    expect(await invoke<string>("get_project")).toBe("ok");
    expect(invoked).toEqual([{ cmd: "get_project", args: {} }]);
  });
});
