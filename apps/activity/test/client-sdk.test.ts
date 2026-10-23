// SPDX-License-Identifier: Apache-2.0
/** The SDK seam (real/mock selection, handshake of the stand-in) and the client socket. */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type ServerMessage } from "@aphrody/shenron-activity/protocol";
import { createFakeSdk } from "../client/fake-sdk";
import {
  apiBaseFor,
  createSdk,
  NotConfiguredError,
  OutsideDiscordError,
  socketUrl,
} from "../client/sdk";
import { defaultRetryDelay, failureForClose, GameConnection } from "../client/socket";
import type { Failure } from "../client/state";
import { U1 } from "./support";

const flags = globalThis as { __ACTIVITY_MOCK__?: boolean };

function location(search: string, hostname = "127.0.0.1", protocol = "http:") {
  return { search, hostname, protocol, host: hostname };
}

describe("where the Activity runs", () => {
  test("inside Discord requests go through /.proxy", () => {
    expect(apiBaseFor("123456789012345678.discordsays.com")).toBe("/.proxy");
    expect(apiBaseFor("activity.dragonballfr.com")).toBe("");
    expect(apiBaseFor("localhost")).toBe("");
    expect(apiBaseFor("evil.com.discordsays.com.evil.com")).toBe("");
  });

  test("the socket URL follows the page's scheme and host", () => {
    expect(socketUrl({ protocol: "https:", host: "1234.discordsays.com" }, "/.proxy")).toBe(
      "wss://1234.discordsays.com/.proxy/ws",
    );
    expect(socketUrl({ protocol: "http:", host: "127.0.0.1:5013" }, "")).toBe(
      "ws://127.0.0.1:5013/ws",
    );
  });
});

describe("createSdk", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    flags.__ACTIVITY_MOCK__ = false;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    flags.__ACTIVITY_MOCK__ = false;
  });

  test("a page not opened by Discord is refused, `?mock=1` or not, in a production build", async () => {
    await expect(createSdk(location(""))).rejects.toBeInstanceOf(OutsideDiscordError);
    await expect(createSdk(location("?mock=1"))).rejects.toBeInstanceOf(OutsideDiscordError);
  });

  test("a development build honours `?mock=1`", async () => {
    flags.__ACTIVITY_MOCK__ = true;
    const sdk = await createSdk(location("?mock=1&user=3&bots=2"));
    expect(sdk.kind).toBe("mock");
    expect(sdk.mock).toEqual({ slot: 3, bots: 2, fast: false });
    // Without the flag even a development build asks for Discord.
    await expect(createSdk(location(""))).rejects.toBeInstanceOf(OutsideDiscordError);
  });

  test("inside Discord but without a configured client id, it says so", async () => {
    globalThis.fetch = (async () => Response.json({ clientId: null })) as unknown as typeof fetch;
    await expect(createSdk(location("?frame_id=abc&instance_id=xyz"))).rejects.toBeInstanceOf(
      NotConfiguredError,
    );
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    await expect(createSdk(location("?frame_id=abc"))).rejects.toBeInstanceOf(NotConfiguredError);
  });
});

describe("the stand-in SDK", () => {
  test("plays the handshake with the shapes of the real one", async () => {
    const sdk = createFakeSdk(new URLSearchParams("mock=1&user=2&lang=ja&instance=room-7"), "");
    expect(sdk).toMatchObject({ kind: "mock", instanceId: "room-7", guildId: null, apiBase: "" });
    await sdk.ready();
    expect(await sdk.authorize()).toBe("mock-code-2");
    await sdk.authenticate("dev-token-2");
    expect(await sdk.locale()).toBe("ja");
    await sdk.invite();
    expect(sdk.mock).toEqual({ slot: 2, bots: 3, fast: false });
  });

  test("clamps what a URL can ask for", () => {
    const wild = createFakeSdk(
      new URLSearchParams("mock=1&user=99&bots=500&instance=a b/c<d>&fast=1"),
      "/.proxy",
    );
    expect(wild.mock).toEqual({ slot: 8, bots: 7, fast: true });
    expect(wild.instanceId).toBe("abcd");
    expect(wild.apiBase).toBe("/.proxy");
    expect(createFakeSdk(new URLSearchParams("mock=1&user=0&instance=%20"), "").mock?.slot).toBe(1);
    expect(createFakeSdk(new URLSearchParams("mock=1&instance=!!"), "").instanceId).toBe(
      "mock-instance",
    );
    expect(createFakeSdk(new URLSearchParams("mock=1&bots=0"), "").mock?.bots).toBe(0);
  });
});

/** A WebSocket that records what the client does and lets the test play the server. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  closedWith: { code?: number; reason?: string } | null = null;
  readonly #listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  // The test plays the server.
  open(): void {
    this.readyState = WebSocket.OPEN;
    this.#fire("open", {});
  }
  receive(message: ServerMessage | Record<string, unknown>): void {
    this.#fire("message", { data: JSON.stringify(message) });
  }
  drop(code: number): void {
    this.readyState = 3;
    this.#fire("close", { code, reason: "" });
  }
  #fire(type: string, event: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

function connection(extra: { onFatal?: (failure: Failure) => void } = {}) {
  FakeSocket.instances = [];
  const log = { messages: [] as ServerMessage[], opened: 0, lost: 0, fatal: [] as Failure[] };
  const conn = new GameConnection({
    url: "ws://127.0.0.1/ws",
    token: "token-goku-1",
    instanceId: "room-1",
    guildId: "222222222222222222",
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
    retryDelayMs: () => 5,
    handlers: {
      onMessage: (message) => log.messages.push(message),
      onOpen: () => void (log.opened += 1),
      onLost: () => void (log.lost += 1),
      onFatal: (failure) => {
        log.fatal.push(failure);
        extra.onFatal?.(failure);
      },
    },
  });
  return { conn, log };
}

const welcome = (): Record<string, unknown> => ({
  v: PROTOCOL_VERSION,
  type: "welcome",
  you: { userId: U1, role: "player" },
  room: {
    instanceId: "room-1",
    phase: "lobby",
    hostId: U1,
    config: { questionCount: 8, categories: ["characters"] },
    availableCategories: ["characters"],
    maxPlayers: 25,
    players: [],
    round: null,
    ranking: [],
    settled: null,
    serverTime: 1,
  },
});

describe("GameConnection", () => {
  test("says hello first, with the token in the frame and not in the URL", () => {
    const { conn, log } = connection();
    conn.start();
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe("ws://127.0.0.1/ws");
    expect(socket.url).not.toContain("token");
    socket.open();
    expect(log.opened).toBe(1);
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      v: PROTOCOL_VERSION,
      type: "hello",
      token: "token-goku-1",
      instanceId: "room-1",
      guildId: "222222222222222222",
    });
    conn.stop();
  });

  test("validates what it receives and relays only valid server messages", () => {
    const { conn, log } = connection();
    conn.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.receive({ v: PROTOCOL_VERSION, type: "nonsense" });
    socket.receive({ v: 99, type: "pong", serverTime: 1 });
    socket.receive(welcome());
    expect(log.messages.map((m) => m.type)).toEqual(["welcome"]);
    expect(conn.send({ v: PROTOCOL_VERSION, type: "start" })).toBe(true);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ v: PROTOCOL_VERSION, type: "start" });
    conn.stop();
    expect(socket.closedWith?.code).toBe(1000);
    expect(conn.send({ v: PROTOCOL_VERSION, type: "start" })).toBe(false);
  });

  test("a dropped socket is reopened with a new hello", async () => {
    const { conn, log } = connection();
    conn.start();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop(1006);
    expect(log.lost).toBe(1);
    await Bun.sleep(30);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.open();
    expect(JSON.parse(FakeSocket.instances[1]!.sent[0]!).type).toBe("hello");
    expect(log.fatal).toEqual([]);
    conn.stop();
  });

  test("closes the server means for good are not retried", async () => {
    const cases: Array<[number, Failure["kind"]]> = [
      [4401, "auth"],
      [4403, "refused"],
      [4409, "replaced"],
      [4400, "server"],
    ];
    for (const [code, kind] of cases) {
      const { conn, log } = connection();
      conn.start();
      FakeSocket.instances[0]!.open();
      FakeSocket.instances[0]!.drop(code);
      await Bun.sleep(30);
      expect(log.fatal.map((failure) => failure.kind)).toEqual([kind]);
      expect(FakeSocket.instances).toHaveLength(1);
      conn.stop();
    }
  });

  test("after `kicked` or `closed` the hang-up is final", async () => {
    for (const message of [
      { v: PROTOCOL_VERSION, type: "kicked", reason: "host" },
      { v: PROTOCOL_VERSION, type: "closed", reason: "empty" },
    ]) {
      const { conn, log } = connection();
      conn.start();
      const socket = FakeSocket.instances[0]!;
      socket.open();
      socket.receive(message);
      socket.drop(1000);
      await Bun.sleep(30);
      expect(FakeSocket.instances).toHaveLength(1);
      expect(log.lost).toBe(0);
      expect(log.fatal).toEqual([]);
      conn.stop();
    }
  });

  test("stopping cancels a pending retry", async () => {
    const { conn } = connection();
    conn.start();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop(1006);
    conn.stop();
    await Bun.sleep(30);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  test("retry delays grow and stop at five seconds; close codes map to failures", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(defaultRetryDelay)).toEqual([
      500, 1000, 2000, 4000, 5000, 5000, 5000,
    ]);
    expect(failureForClose(1006)).toBeNull();
    expect(failureForClose(1000)).toBeNull();
    expect(failureForClose(4503)).toBeNull();
    expect(failureForClose(4401)).toEqual({ kind: "auth" });
  });
});
