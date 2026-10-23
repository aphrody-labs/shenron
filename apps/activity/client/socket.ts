// SPDX-License-Identifier: Apache-2.0
/**
 * The client side of the game socket: hello, heartbeat, reconnection.
 *
 * One `GameConnection` is one seat. It sends the hello frame (the Discord token, never in the URL),
 * validates every frame with the shared protocol, pings every `HEARTBEAT_INTERVAL_MS`, and
 * reconnects with a growing delay unless the server closed it for a reason that retrying cannot
 * change (refused, replaced, unauthorized, kicked, room closed). A reconnection starts with a new
 * hello, and the server answers with a fresh `welcome`: the client never has to patch missed state.
 */
import {
  HEARTBEAT_INTERVAL_MS,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@aphrody/shenron-activity/protocol";
import type { Failure } from "./state";

/** Close codes of the server transport (apps/activity/src/ws/hello.ts). */
export const CLOSE_CODES = {
  badHello: 4400,
  unauthorized: 4401,
  refused: 4403,
  timeout: 4408,
  replaced: 4409,
  busy: 4503,
} as const;

export interface ConnectionHandlers {
  onMessage(message: ServerMessage): void;
  /** The socket opened and the hello was sent. */
  onOpen(): void;
  /** The socket dropped; a retry is scheduled. */
  onLost(): void;
  /** The socket will not come back. */
  onFatal(failure: Failure): void;
}

export interface ConnectionOptions {
  readonly url: string;
  readonly token: string;
  readonly instanceId: string;
  readonly guildId: string | null;
  readonly handlers: ConnectionHandlers;
  readonly createSocket?: (url: string) => WebSocket;
  /** Delay before reconnection attempt `n` (1-based), in ms. */
  readonly retryDelayMs?: (attempt: number) => number;
}

export function defaultRetryDelay(attempt: number): number {
  return Math.min(5_000, 500 * 2 ** (attempt - 1));
}

export class GameConnection {
  readonly #options: ConnectionOptions;
  #socket: WebSocket | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #attempt = 0;
  #stopped = false;
  #final = false;

  constructor(options: ConnectionOptions) {
    this.#options = options;
  }

  start(): void {
    this.#stopped = false;
    this.#open();
  }

  send(message: ClientMessage): boolean {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  /** Pings now (the page became visible again: a suspended mobile client may have been dropped). */
  ping(): void {
    this.send({ v: PROTOCOL_VERSION, type: "ping", t: Date.now() });
  }

  stop(): void {
    this.#stopped = true;
    this.#clearTimers();
    const socket = this.#socket;
    this.#socket = null;
    socket?.close(1000, "client closing");
  }

  #clearTimers(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    if (this.#retry) clearTimeout(this.#retry);
    this.#heartbeat = null;
    this.#retry = null;
  }

  #open(): void {
    const { url, token, instanceId, guildId, handlers } = this.#options;
    const socket = (this.#options.createSocket ?? ((target) => new WebSocket(target)))(url);
    this.#socket = socket;
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "hello",
          token,
          instanceId,
          ...(guildId ? { guildId } : {}),
        }),
      );
      handlers.onOpen();
      this.#heartbeat = setInterval(() => this.ping(), HEARTBEAT_INTERVAL_MS);
    });
    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === "welcome") this.#attempt = 0;
      // After these two the server hangs up on purpose: do not reconnect.
      if (message.type === "kicked" || message.type === "closed") this.#final = true;
      handlers.onMessage(message);
    });
    socket.addEventListener("close", (event) => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#clearTimers();
      if (this.#stopped || this.#final) return;
      const failure = failureForClose(event.code);
      if (failure) {
        this.#final = true;
        handlers.onFatal(failure);
        return;
      }
      handlers.onLost();
      this.#attempt += 1;
      const delay = (this.#options.retryDelayMs ?? defaultRetryDelay)(this.#attempt);
      this.#retry = setTimeout(() => this.#open(), delay);
    });
  }
}

/** The failure a close code means, or `null` when a retry makes sense. */
export function failureForClose(code: number): Failure | null {
  switch (code) {
    case CLOSE_CODES.unauthorized:
      return { kind: "auth" };
    case CLOSE_CODES.refused:
      return { kind: "refused" };
    case CLOSE_CODES.replaced:
      return { kind: "replaced" };
    case CLOSE_CODES.badHello:
      return { kind: "server" };
    default:
      return null;
  }
}
