// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";

import { KOHARU_SESSION_HEADER, koharuBridge, type EngineProcess } from "../src/koharu";

const SESSION = "session-0001";
const BASE = "http://127.0.0.1:4100/api/local/koharu";

/** An engine answering a few commands the way koharu-sdk does. */
function fakeEngine() {
  const spawned: string[][] = [];
  const received: Record<string, unknown>[] = [];
  let exit: (code: number) => void = () => {};
  const spawn = (command: string[]): EngineProcess => {
    spawned.push(command);
    let push: (line: string) => void = () => {};
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (line) => controller.enqueue(new TextEncoder().encode(`${line}\n`));
      },
    });
    const send = (value: unknown) => push(JSON.stringify(value));
    return {
      stdout,
      exited: new Promise<number>((resolve) => {
        exit = resolve;
      }),
      kill: () => exit(137),
      stdin: {
        write(chunk: string) {
          const request = JSON.parse(chunk) as {
            id: number;
            command: string;
            args: Record<string, unknown>;
          };
          received.push(request);
          if (request.command === "subscribe") {
            const channel = Number(String(request.args.onCanvas).split(":")[1]);
            send({ channel, message: { generation: 1 } });
            send({ id: request.id, result: { canvas: true } });
          } else if (request.command === "get_thumbnail") {
            send({ id: request.id, result: { $bytes: Buffer.from([9, 8, 7]).toString("base64") } });
          } else if (request.command === "get_pages") {
            send({ id: request.id, error: "no project is open" });
          } else {
            send({ id: request.id, result: null });
          }
        },
      },
    };
  };
  return { spawn, spawned, received, exit: (code: number) => exit(code) };
}

function invoke(bridge: ReturnType<typeof koharuBridge>, body: unknown, peer = "127.0.0.1") {
  const request = new Request(`${BASE}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", [KOHARU_SESSION_HEADER]: SESSION },
    body: JSON.stringify(body),
  });
  return bridge.handle(request, new URL(request.url), peer);
}

async function readEvents(response: Response, count: number): Promise<unknown[]> {
  const reader = response.body!.getReader();
  const events: unknown[] = [];
  let text = "";
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
    let end: number;
    while ((end = text.indexOf("\n\n")) !== -1) {
      const frame = text.slice(0, end);
      text = text.slice(end + 2);
      if (frame.startsWith("data: ")) events.push(JSON.parse(frame.slice(6)));
    }
  }
  await reader.cancel();
  return events;
}

describe("/api/local/koharu", () => {
  test("relays a command, renumbers its channels and streams their values", async () => {
    const engine = fakeEngine();
    const bridge = koharuBridge({ binary: "/opt/koharu-sdk", spawn: engine.spawn });
    bridge.setServerUrl("http://127.0.0.1:4100/");
    const response = (await invoke(bridge, {
      command: "subscribe",
      args: { onCanvas: "__CHANNEL__:7", other: ["__CHANNEL__:7", "plain"] },
    }))!;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { canvas: true } });
    expect(engine.spawned).toEqual([["/opt/koharu-sdk", "--shenron-url", "http://127.0.0.1:4100"]]);
    const sent = engine.received[0]!.args as { onCanvas: string; other: string[] };
    expect(sent.onCanvas).toMatch(/^__CHANNEL__:\d+$/);
    expect(sent.other).toEqual([sent.onCanvas, "plain"]);

    // The channel value emitted before the stream opened is replayed to the page's number.
    const events = new Request(`${BASE}/events?session=${SESSION}`);
    const stream = (await bridge.handle(events, new URL(events.url), "127.0.0.1"))!;
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    expect(await readEvents(stream, 1)).toEqual([{ channel: 7, message: { generation: 1 } }]);
    bridge.stop();
  });

  test("answers byte results as octet-stream and engine errors as 422", async () => {
    const engine = fakeEngine();
    const bridge = koharuBridge({ binary: "/opt/koharu-sdk", spawn: engine.spawn });
    const bytes = (await invoke(bridge, { command: "get_thumbnail", args: { page: "p" } }))!;
    expect(bytes.headers.get("content-type")).toBe("application/octet-stream");
    expect([...new Uint8Array(await bytes.arrayBuffer())]).toEqual([9, 8, 7]);
    const failed = (await invoke(bridge, { command: "get_pages" }))!;
    expect(failed.status).toBe(422);
    expect(await failed.json()).toEqual({ error: "no project is open" });
    bridge.stop();
  });

  test("restarts the engine after it exits and fails its pending calls", async () => {
    const engine = fakeEngine();
    const bridge = koharuBridge({ binary: "/opt/koharu-sdk", spawn: engine.spawn });
    expect((await invoke(bridge, { command: "close_project" }))!.status).toBe(200);
    engine.exit(1);
    await Bun.sleep(5);
    expect((await invoke(bridge, { command: "close_project" }))!.status).toBe(200);
    expect(engine.spawned.length).toBe(2);
    bridge.stop();
  });

  test("answers this machine only, same origin, valid sessions and commands", async () => {
    const engine = fakeEngine();
    const bridge = koharuBridge({ binary: "/opt/koharu-sdk", spawn: engine.spawn });
    expect((await invoke(bridge, { command: "get_project" }, "192.168.1.20"))!.status).toBe(403);
    const foreign = new Request(`${BASE}/invoke`, {
      method: "POST",
      headers: { origin: "https://evil.example", [KOHARU_SESSION_HEADER]: SESSION },
      body: "{}",
    });
    expect((await bridge.handle(foreign, new URL(foreign.url), "127.0.0.1"))!.status).toBe(403);
    const rebound = new Request("http://evil.example:4100/api/local/koharu/invoke", {
      method: "POST",
      body: "{}",
    });
    expect((await bridge.handle(rebound, new URL(rebound.url), "127.0.0.1"))!.status).toBe(403);
    expect((await invoke(bridge, { command: "../etc" }))!.status).toBe(400);
    const anonymous = new Request(`${BASE}/invoke`, { method: "POST", body: "{}" });
    expect((await bridge.handle(anonymous, new URL(anonymous.url), "127.0.0.1"))!.status).toBe(400);
    expect(engine.spawned).toEqual([]);
    expect(await bridge.handle(new Request(`${BASE}x`), new URL(`${BASE}x`), "127.0.0.1")).toBe(
      null,
    );
    bridge.stop();
  });

  test("reports itself unavailable without an engine or in production", async () => {
    const missing = koharuBridge({ binary: null });
    expect(missing.status()).toEqual({ available: false, reason: "moteur koharu-sdk absent" });
    expect((await invoke(missing, { command: "get_project" }))!.status).toBe(503);
    const production = koharuBridge({
      binary: "/opt/koharu-sdk",
      disabled: "désactivé en production",
    });
    expect(production.status().available).toBe(false);
    expect(koharuBridge({ binary: "/opt/koharu-sdk" }).status()).toEqual({ available: true });
  });
});
