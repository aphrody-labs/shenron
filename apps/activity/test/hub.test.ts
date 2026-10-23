// SPDX-License-Identifier: Apache-2.0
/** The hub on fake sockets and a manual clock: presence, expiry, spam, back-pressure, membership. */
import { describe, expect, test } from "bun:test";
import { seededRng } from "@aphrody/shenron-activity";
import {
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@aphrody/shenron-activity/protocol";
import { ManualClock } from "@aphrody/shenron-activity/testing";
import { ActivityHub, newSocketState, type HubSocket } from "../src/ws/hub";
import { fakeDiscord, INSTANCE, testBank, U1, U2 } from "./support";

class FakeHubSocket implements HubSocket {
  readonly data = newSocketState();
  readonly frames: ServerMessage[] = [];
  closed: { code?: number; reason?: string } | null = null;
  /** What `send` reports: Bun returns 0 when it dropped the frame. */
  sendStatus = 1;

  send(frame: string): number {
    const message = parseServerMessage(frame);
    if (message) this.frames.push(message);
    return this.sendStatus;
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  of<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.frames.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }
}

function setup(options: Partial<ConstructorParameters<typeof ActivityHub>[0]> = {}) {
  const clock = new ManualClock();
  const hub = new ActivityHub({
    clock,
    discord: fakeDiscord(),
    bank: testBank(),
    rng: seededRng("hub"),
    ...options,
  });
  return { clock, hub };
}

async function join(
  hub: ActivityHub,
  token: string,
  instanceId = INSTANCE,
): Promise<FakeHubSocket> {
  const socket = new FakeHubSocket();
  hub.open(socket);
  await hub.message(
    socket,
    JSON.stringify({ v: PROTOCOL_VERSION, type: "hello", token, instanceId }),
  );
  return socket;
}

const frame = (message: ClientMessage) => JSON.stringify(message);
const ping = frame({ v: PROTOCOL_VERSION, type: "ping", t: 1 });

describe("ActivityHub", () => {
  test("seats a member, then welcomes them again if the room dropped them for silence", async () => {
    const { clock, hub } = setup();
    const a = await join(hub, "token-goku-1");
    const b = await join(hub, "token-vegeta-2");
    expect(a.of("welcome")).toHaveLength(1);

    // Both keep their sockets but stop pinging: the room treats them as gone.
    clock.advance(46_000);
    hub.tick();
    expect(hub.registry.get(INSTANCE)?.connectedCount).toBe(0);

    // The suspended page wakes up and pings: no pong would come from a room that dropped them,
    // so the hub seats them again and the client gets a fresh welcome.
    await hub.message(a, ping);
    expect(a.of("welcome")).toHaveLength(2);
    expect(hub.registry.get(INSTANCE)?.connectedCount).toBe(1);
    expect(a.of("pong")).toHaveLength(0);
    // From then on its pings are answered normally.
    await hub.message(a, ping);
    expect(a.of("pong")).toHaveLength(1);
    expect(b.closed).toBeNull();
  });

  test("a membership check can turn a member away", async () => {
    const { hub } = setup({ verifyMembership: async (_instance, user) => user !== U2 });
    const a = await join(hub, "token-goku-1");
    const b = await join(hub, "token-vegeta-2");
    expect(a.closed).toBeNull();
    expect(b.closed).toEqual({ code: 4403, reason: "not in this activity" });
    expect(hub.registry.get(INSTANCE)?.has(U2)).toBe(false);
  });

  test("a room that expires tells its sockets and hangs up", async () => {
    const { clock, hub } = setup();
    const a = await join(hub, "token-goku-1");
    // Heartbeats keep the member present but nothing happens in the room for a quarter of an hour.
    for (let i = 0; i < 61; i++) {
      clock.advance(15_000);
      await hub.message(a, ping);
    }
    clock.advance(1_000);
    hub.tick();
    expect(a.of("closed")[0]?.reason).toBe("expired");
    expect(a.closed?.code).toBe(1000);
    expect(hub.registry.size).toBe(0);
    // A new connection for the same Discord instance gets a fresh room.
    const again = await join(hub, "token-goku-1");
    expect(again.of("welcome")[0]?.room.phase).toBe("lobby");
  });

  test("a member who floods the room is removed and disconnected", async () => {
    const { hub } = setup();
    const a = await join(hub, "token-goku-1");
    const b = await join(hub, "token-vegeta-2");
    for (let i = 0; i < 80 && !b.closed; i++) await hub.message(b, ping);
    expect(b.of("kicked")[0]?.reason).toBe("spam");
    expect(b.closed?.code).toBe(4403);
    expect(a.closed).toBeNull();
    // Banned for the life of the room.
    const again = await join(hub, "token-vegeta-2");
    expect(again.closed?.reason).toBe("banned");
  });

  test("a client that cannot keep up is dropped rather than left out of sync", async () => {
    const { hub } = setup();
    const a = await join(hub, "token-goku-1");
    a.sendStatus = 0;
    await join(hub, "token-vegeta-2");
    expect(a.closed).toEqual({ code: 1013, reason: "too slow" });
  });

  test("sockets beyond the limit are refused, and a stopped hub accepts none", async () => {
    const { hub } = setup({ maxSockets: 2 });
    await join(hub, "token-goku-1");
    await join(hub, "token-vegeta-2");
    const third = new FakeHubSocket();
    hub.open(third);
    expect(third.closed?.code).toBe(4503);
    expect(hub.stats.sockets).toBe(2);
    hub.stop();
    const late = new FakeHubSocket();
    hub.open(late);
    expect(late.closed?.code).toBe(4503);
  });

  test("a socket that closes while Discord is still answering is not seated", async () => {
    let release: (() => void) | undefined;
    const slow = {
      exchangeCode: async () => ({ ok: false, reason: "invalid_code" }) as const,
      identify: async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return { userId: U1, name: "Son Goku", avatar: null };
      },
    };
    const { hub } = setup({ discord: slow });
    const socket = new FakeHubSocket();
    hub.open(socket);
    const pending = hub.message(
      socket,
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "hello",
        token: "token-goku-1",
        instanceId: INSTANCE,
      }),
    );
    hub.close(socket);
    release?.();
    await pending;
    expect(hub.registry.size).toBe(0);
    expect(socket.frames).toEqual([]);
    expect(hub.stats.sockets).toBe(0);
  });

  test("frames before the hello and a second hello are ignored", async () => {
    const { hub } = setup();
    const socket = await join(hub, "token-goku-1");
    await hub.message(
      socket,
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "hello",
        token: "token-vegeta-2",
        instanceId: INSTANCE,
      }),
    );
    // The second hello is an unknown message for the game protocol: an error, not a new identity.
    expect(socket.of("error")[0]?.code).toBe("invalid_message");
    expect(hub.registry.get(INSTANCE)?.has(U2)).toBe(false);
  });

  test("binary frames are invalid messages", async () => {
    const { hub } = setup();
    const socket = await join(hub, "token-goku-1");
    await hub.message(socket, new Uint8Array([1, 2, 3]));
    expect(socket.of("error")[0]?.code).toBe("invalid_message");
  });
});
