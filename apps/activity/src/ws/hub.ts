// SPDX-License-Identifier: Apache-2.0
/**
 * The socket layer of the Activity: authenticates sockets, seats them in the room of their Discord
 * `instance_id`, relays the room's addressed messages, and drives the clock of the rooms.
 *
 * The rooms (`@aphrody/shenron-activity/rooms`) own every rule; this class owns the sockets and the
 * time. A socket lives through three stages:
 *
 *   hello          waiting for its first frame, `{ type: "hello", token, instanceId }`
 *   authenticating the token is being checked against Discord (`GET /users/@me`)
 *   ready          seated in a room; every frame goes through the strict protocol parser
 *
 * One timer serves all rooms: it is armed on `registry.nextDeadline()` and plays `registry.tick()`
 * when it fires. Rooms also catch up by themselves whenever a message reaches them, so a late timer
 * never changes a result.
 */
import { systemClock, type Clock } from "@aphrody/shenron-activity";
import {
  encodeServerMessage,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
  type Settled,
} from "@aphrody/shenron-activity/protocol";
import {
  RoomRegistry,
  type Outbound,
  type RegistryOptions,
  type Room,
} from "@aphrody/shenron-activity/rooms";
import type { DiscordIdentity, DiscordPort } from "../auth/discord";
import { silentLogger, type Logger } from "../log";
import { CLOSE, parseHello } from "./hello";

export type SocketStage = "hello" | "authenticating" | "ready" | "closed";

/** Per-socket state, attached to the Bun `ServerWebSocket` as `data`. */
export interface SocketState {
  stage: SocketStage;
  instanceId: string | null;
  identity: DiscordIdentity | null;
  /** The room already forgot this socket (kicked, replaced): closing it must not call `leave`. */
  detached: boolean;
  invalidFrames: number;
  helloTimer: ReturnType<typeof setTimeout> | null;
}

export function newSocketState(): SocketState {
  return {
    stage: "hello",
    instanceId: null,
    identity: null,
    detached: false,
    invalidFrames: 0,
    helloTimer: null,
  };
}

/** What the hub needs from a `ServerWebSocket`. */
export interface HubSocket {
  send(data: string): number;
  close(code?: number, reason?: string): void;
  readonly data: SocketState;
}

export interface HubOptions extends Pick<
  RegistryOptions,
  "bank" | "rng" | "limits" | "rewardPolicy" | "recentlySeen" | "onSettlement" | "maxRooms"
> {
  readonly clock?: Clock;
  readonly discord: DiscordPort;
  readonly log?: Logger;
  /** How long a socket may stay silent before its hello (ms). */
  readonly helloTimeoutMs?: number;
  /** Invalid frames tolerated per socket before it is dropped. */
  readonly maxInvalidFrames?: number;
  /** Sockets accepted at once. */
  readonly maxSockets?: number;
  /**
   * Whether `userId` belongs to the Discord instance (lot A3: the bot reads the participants of
   * the instance with its own token; the Activity never holds it). Absent: every user whose token
   * Discord accepts is admitted, which the token alone cannot tell apart from a participant.
   */
  readonly verifyMembership?: (instanceId: string, userId: string) => Promise<boolean>;
}

const MAX_TIMER_MS = 2 ** 31 - 1;
const MIN_TIMER_MS = 5;

export class ActivityHub {
  readonly registry: RoomRegistry;
  readonly #clock: Clock;
  readonly #discord: DiscordPort;
  readonly #log: Logger;
  readonly #options: HubOptions;
  readonly #sockets = new Map<string, Map<string, HubSocket>>();
  #count = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #stopped = false;

  constructor(options: HubOptions) {
    this.#options = options;
    this.#clock = options.clock ?? systemClock;
    this.#discord = options.discord;
    this.#log = options.log ?? silentLogger;
    this.registry = new RoomRegistry({
      clock: this.#clock,
      bank: options.bank,
      rng: options.rng,
      limits: options.limits,
      rewardPolicy: options.rewardPolicy,
      recentlySeen: options.recentlySeen,
      onSettlement: options.onSettlement,
      maxRooms: options.maxRooms,
      onRoomClosed: (instanceId, reason) => this.#log.info("room closed", { instanceId, reason }),
    });
  }

  get stats(): { rooms: number; sockets: number } {
    return { rooms: this.registry.size, sockets: this.#count };
  }

  // ── Socket events ──────────────────────────────────────────────────────────

  open(ws: HubSocket): void {
    if (this.#stopped || this.#count >= (this.#options.maxSockets ?? 5_000)) {
      ws.close(CLOSE.busy, "busy");
      return;
    }
    this.#count += 1;
    ws.data.helloTimer = setTimeout(
      () => ws.close(CLOSE.timeout, "hello timeout"),
      this.#options.helloTimeoutMs ?? 10_000,
    );
  }

  async message(ws: HubSocket, raw: string | Buffer | ArrayBuffer | Uint8Array): Promise<void> {
    const state = ws.data;
    if (state.stage === "hello") return this.#hello(ws, raw);
    if (state.stage !== "ready" || state.identity === null || state.instanceId === null) return;

    const { instanceId } = state;
    const userId = state.identity.userId;
    const parsed = parseClientMessage(typeof raw === "string" ? raw : null);
    if (!parsed.ok) {
      state.invalidFrames += 1;
      if (state.invalidFrames > (this.#options.maxInvalidFrames ?? 20)) {
        ws.close(CLOSE.timeout, "too many invalid frames");
        return;
      }
      this.#send(ws, { v: PROTOCOL_VERSION, type: "error", code: parsed.code });
      return;
    }
    const room = this.registry.get(instanceId);
    if (!room) {
      // The room closed under this socket (expired, emptied): the client may reconnect for a new one.
      ws.close(CLOSE.normal, "room closed");
      return;
    }
    const out = room.receive(userId, parsed.message);
    // A connected member always gets an answer to a ping (pong or rate_limited). Silence means the
    // room had dropped this member for missing heartbeats while the socket survived (a suspended
    // mobile client, for instance): seat them again.
    const answered =
      parsed.message.type !== "ping" ||
      out.some((item) => item.target.to === "user" && item.target.userId === userId);
    this.#flush(instanceId, out);
    if (!answered) this.#rejoin(ws, room, state.identity);
    this.#reschedule();
  }

  close(ws: HubSocket): void {
    const state = ws.data;
    if (state.helloTimer) clearTimeout(state.helloTimer);
    state.helloTimer = null;
    if (state.stage === "closed") return;
    const previous = state.stage;
    state.stage = "closed";
    this.#count = Math.max(0, this.#count - 1);
    if (previous !== "ready" || state.identity === null || state.instanceId === null) return;

    const { instanceId } = state;
    const userId = state.identity.userId;
    const peers = this.#sockets.get(instanceId);
    if (peers?.get(userId) === ws) {
      peers.delete(userId);
      if (peers.size === 0) this.#sockets.delete(instanceId);
    }
    if (state.detached) return;
    const room = this.registry.get(instanceId);
    if (room) this.#flush(instanceId, room.leave(userId));
    this.#reschedule();
  }

  // ── Server events ──────────────────────────────────────────────────────────

  /** What the bot actually paid for a finished round: tells the room and its sockets. */
  applySettled(instanceId: string, settled: Settled): void {
    const room = this.registry.get(instanceId);
    if (!room) return;
    this.#flush(instanceId, room.applySettled(settled));
  }

  /** Plays every deadline that has passed. Called by the timer; exposed for tests. */
  tick(): void {
    for (const { instanceId, out } of this.registry.tick()) this.#flush(instanceId, out);
    this.#reschedule();
  }

  /** Closes every room and socket (server shutdown). */
  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    for (const { instanceId, out } of this.registry.closeAll("shutdown"))
      this.#flush(instanceId, out);
    for (const peers of this.#sockets.values())
      for (const ws of peers.values()) ws.close(CLOSE.goingAway, "server stopping");
    this.#sockets.clear();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  async #hello(ws: HubSocket, raw: string | Buffer | ArrayBuffer | Uint8Array): Promise<void> {
    const state = ws.data;
    state.stage = "authenticating";
    if (state.helloTimer) clearTimeout(state.helloTimer);
    state.helloTimer = null;

    const hello = parseHello(typeof raw === "string" ? raw : null);
    if (!hello) {
      ws.close(CLOSE.badHello, "bad hello");
      return;
    }
    const identity = await this.#discord.identify(hello.token, hello.guildId ?? null);
    // The socket may have closed while Discord was answering.
    if ((state.stage as SocketStage) !== "authenticating") return;
    if (!identity) {
      ws.close(CLOSE.unauthorized, "unauthorized");
      return;
    }
    const member = await this.#options.verifyMembership?.(hello.instanceId, identity.userId);
    if ((state.stage as SocketStage) !== "authenticating") return;
    if (member === false) {
      ws.close(CLOSE.refused, "not in this activity");
      return;
    }

    const room = this.registry.open(hello.instanceId);
    if (!room) {
      ws.close(CLOSE.busy, "no room available");
      return;
    }
    const peers = this.#sockets.get(hello.instanceId) ?? new Map<string, HubSocket>();
    const previous = peers.get(identity.userId);
    if (previous && previous !== ws) {
      // A second window of the same member (another device): the newest one wins.
      previous.data.detached = true;
      peers.delete(identity.userId);
      previous.close(CLOSE.replaced, "replaced");
    }
    peers.set(identity.userId, ws);
    this.#sockets.set(hello.instanceId, peers);
    state.stage = "ready";
    state.instanceId = hello.instanceId;
    state.identity = identity;

    const result = room.join({
      userId: identity.userId,
      name: identity.name,
      avatar: identity.avatar,
    });
    this.#flush(hello.instanceId, result.out);
    if (!result.admitted) {
      state.detached = true;
      if (peers.get(identity.userId) === ws) peers.delete(identity.userId);
      ws.close(CLOSE.refused, result.code);
    }
    this.#reschedule();
  }

  #rejoin(ws: HubSocket, room: Room, identity: DiscordIdentity): void {
    const result = room.join({
      userId: identity.userId,
      name: identity.name,
      avatar: identity.avatar,
    });
    this.#flush(room.instanceId, result.out);
    if (!result.admitted) {
      ws.data.detached = true;
      ws.close(CLOSE.refused, result.code);
    }
  }

  #send(ws: HubSocket, message: ServerMessage): void {
    this.#sendFrame(ws, encodeServerMessage(message));
  }

  #sendFrame(ws: HubSocket, frame: string): void {
    // 0 means Bun dropped the frame (the client cannot keep up): better gone than out of sync.
    if (ws.send(frame) === 0) ws.close(CLOSE.tooSlow, "too slow");
  }

  /** Delivers what a room emitted to the sockets of its instance. */
  #flush(instanceId: string, out: readonly Outbound[]): void {
    const peers = this.#sockets.get(instanceId);
    let closing = false;
    for (const { target, message } of out) {
      if (message.type === "closed") closing = true;
      if (!peers) continue;
      const frame = encodeServerMessage(message);
      if (target.to === "all") {
        for (const ws of peers.values()) this.#sendFrame(ws, frame);
      } else if (target.to === "user") {
        const ws = peers.get(target.userId);
        if (ws) this.#sendFrame(ws, frame);
      } else {
        for (const [userId, ws] of peers) if (userId !== target.userId) this.#sendFrame(ws, frame);
      }
      if (message.type === "kicked" && target.to === "user") {
        const ws = peers.get(target.userId);
        if (ws) {
          ws.data.detached = true;
          peers.delete(target.userId);
          ws.close(CLOSE.refused, "kicked");
        }
      }
    }
    if (closing) {
      for (const ws of peers?.values() ?? []) {
        ws.data.detached = true;
        ws.close(CLOSE.normal, "room closed");
      }
      this.#sockets.delete(instanceId);
    } else if (peers && peers.size === 0) {
      this.#sockets.delete(instanceId);
    }
  }

  #reschedule(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (this.#stopped) return;
    const deadline = this.registry.nextDeadline();
    if (deadline === null) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(MIN_TIMER_MS, deadline - this.#clock.now() + 1));
    this.#timer = setTimeout(() => {
      this.#timer = null;
      try {
        this.tick();
      } catch (error) {
        this.#log.error("room tick failed", { error: (error as Error).message });
        this.#reschedule();
      }
    }, delay);
    // The timer must not keep a stopping process alive.
    (this.#timer as { unref?: () => void }).unref?.();
  }
}
