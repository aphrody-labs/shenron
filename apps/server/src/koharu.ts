// SPDX-License-Identifier: Apache-2.0
/**
 * `/api/local/koharu`: the manga translation editor of a browser on this server, relayed to a
 * `koharu-sdk` child (the engine of `koharu-library` over JSON Lines). Shenron Studio's own
 * window never comes here: it runs the same engine in process through Tauri IPC.
 *
 *   GET  /api/local/koharu/events?session=<id>   server-sent events of the session's channels:
 *                                                `{ channel, message }`, then `{ channel, end }`
 *   POST /api/local/koharu/invoke                `{ command, args }` with `x-koharu-session`;
 *                                                `{ result }`, raw bytes (octet-stream) or
 *                                                `{ error }`
 *
 * Commands, arguments and results are those of the generated protocol
 * (`@aphrody/shenron-koharu/protocol`, transport `./transport`). Channel tokens (`__CHANNEL__:<n>`) are
 * numbered per session by the page and renumbered here for the one engine process, which is
 * started on first use and again after it exits. The engine reads and writes local files and
 * credentials: the bridge answers loopback peers on a loopback host only, never cross-origin,
 * and never in the production profile.
 */
import type { LocalApiGroupStatus } from "@aphrody/shenron-api/contract";

export const KOHARU_PATH = "/api/local/koharu";
export const KOHARU_SESSION_HEADER = "x-koharu-session";
/** Interval of the keepalive comments of the event stream (below the 120 s idle timeout). */
export const KOHARU_KEEPALIVE_MS = 15_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_BUFFERED_EVENTS = 2_000;
/** A session without an event stream is forgotten after this delay. */
const SESSION_TTL_MS = 10 * 60_000;
const SESSION = /^[A-Za-z0-9-]{8,64}$/;
const COMMAND = /^[a-z][a-z0-9_]{0,63}$/;
const CHANNEL = /^__CHANNEL__:(\d{1,9})$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** The engine process, as `Bun.spawn` returns it (a fake in tests). */
export interface EngineProcess {
  stdin: { write(chunk: string): unknown; flush?(): unknown; end?(): unknown };
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(): void;
}

export type SpawnEngine = (
  command: string[],
  env: Record<string, string | undefined>,
) => EngineProcess;

const spawnEngine: SpawnEngine = (command, env) =>
  Bun.spawn(command, {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    windowsHide: true,
  }) as unknown as EngineProcess;

interface Session {
  streams: Set<ReadableStreamDefaultController<Uint8Array>>;
  buffer: string[];
  touched: number;
}

interface Pending {
  resolve(value: { result?: unknown; error?: unknown }): void;
}

export interface KoharuBridge {
  /** Availability for `/api/local/health` (`groups.koharu`). */
  status(): LocalApiGroupStatus;
  /** Base URL of this server, for the agent's corpus search (`--shenron-url`). */
  setServerUrl(url: string): void;
  /** Answer `/api/local/koharu/*`; `null` for any other path. */
  handle(request: Request, url: URL, peer: string | null): Promise<Response | null>;
  stop(): void;
}

export interface KoharuOptions {
  /** `koharu-sdk` beside the server (or SHENRON_KOHARU_SDK_BIN); `null`: unavailable. */
  binary: string | null;
  /** Why the bridge is off when it is (production profile, no engine). */
  disabled?: string;
  env?: Record<string, string | undefined>;
  spawn?: SpawnEngine;
}

const encoder = new TextEncoder();
const noStore = { "cache-control": "no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: noStore });
}

function isLoopback(address: string | null): boolean {
  if (!address) return false;
  const plain = address.replace(/^::ffff:/, "");
  return plain === "::1" || plain.startsWith("127.");
}

/** Loopback peer, loopback `Host`, and same-origin when the browser says where it comes from. */
export function local(request: Request, url: URL, peer: string | null): boolean {
  if (!isLoopback(peer) || !LOOPBACK_HOSTS.has(url.hostname)) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/** Replace the page's channel tokens by the engine's, recording each one for the session. */
function renumber(value: unknown, map: (local: number) => number): unknown {
  if (typeof value === "string") {
    const match = CHANNEL.exec(value);
    return match ? `__CHANNEL__:${map(Number(match[1]))}` : value;
  }
  if (Array.isArray(value)) return value.map((item) => renumber(item, map));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renumber(item, map)]),
    );
  return value;
}

export function koharuBridge(o: KoharuOptions): KoharuBridge {
  const sessions = new Map<string, Session>();
  /** Engine channel → its session and the page's number. */
  const channels = new Map<number, { session: string; local: number }>();
  const pending = new Map<number, Pending>();
  let engine: EngineProcess | null = null;
  let serverUrl: string | null = null;
  let nextRequest = 0;
  let nextChannel = 0;

  const session = (id: string): Session => {
    let found = sessions.get(id);
    if (!found) {
      found = { streams: new Set(), buffer: [], touched: Date.now() };
      sessions.set(id, found);
    }
    found.touched = Date.now();
    return found;
  };

  const sweep = () => {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (entry.streams.size === 0 && now - entry.touched > SESSION_TTL_MS) {
        sessions.delete(id);
        for (const [channel, owner] of channels) if (owner.session === id) channels.delete(channel);
      }
    }
  };

  const emit = (id: string, event: unknown) => {
    const entry = sessions.get(id);
    if (!entry) return;
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    if (entry.streams.size === 0) {
      entry.buffer.push(frame);
      if (entry.buffer.length > MAX_BUFFERED_EVENTS) entry.buffer.shift();
      return;
    }
    const bytes = encoder.encode(frame);
    for (const stream of entry.streams) {
      try {
        stream.enqueue(bytes);
      } catch {
        entry.streams.delete(stream);
      }
    }
  };

  const receive = (line: string) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message.channel === "number") {
      const owner = channels.get(message.channel);
      if (!owner) return;
      if (message.end === true) {
        channels.delete(message.channel);
        emit(owner.session, { channel: owner.local, end: true });
      } else {
        emit(owner.session, { channel: owner.local, message: message.message });
      }
      return;
    }
    if (typeof message.id === "number") {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      request.resolve(message);
    }
  };

  const closed = (reason: string) => {
    engine = null;
    for (const request of pending.values()) request.resolve({ error: reason });
    pending.clear();
    for (const [, owner] of channels) emit(owner.session, { channel: owner.local, end: true });
    channels.clear();
  };

  const start = (): EngineProcess => {
    if (engine) return engine;
    if (!o.binary) throw new Error("koharu-sdk is not installed beside the server");
    const command = [o.binary, ...(serverUrl ? ["--shenron-url", serverUrl] : [])];
    const child = (o.spawn ?? spawnEngine)(command, o.env ?? process.env);
    engine = child;
    void (async () => {
      const reader = child.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, end).trim();
            buffer = buffer.slice(end + 1);
            if (line) receive(line);
          }
        }
      } catch {
        // the exit below reports the failure
      }
      if (engine === child) closed("the Koharu engine stopped");
    })();
    void child.exited.then((code) => {
      if (engine === child) closed(`the Koharu engine exited (${code})`);
      return undefined;
    });
    return child;
  };

  const call = (command: string, args: unknown): Promise<{ result?: unknown; error?: unknown }> => {
    const child = start();
    const id = ++nextRequest;
    return new Promise((resolve) => {
      pending.set(id, { resolve });
      try {
        child.stdin.write(`${JSON.stringify({ id, command, args })}\n`);
        child.stdin.flush?.();
      } catch (error) {
        pending.delete(id);
        resolve({ error: `the Koharu engine is unreachable: ${String(error)}` });
      }
    });
  };

  const events = (id: string): Response => {
    const entry = session(id);
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let keepalive: ReturnType<typeof setInterval> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        controller = stream;
        entry.streams.add(stream);
        stream.enqueue(encoder.encode(": koharu\n\n"));
        for (const frame of entry.buffer.splice(0)) stream.enqueue(encoder.encode(frame));
        keepalive = setInterval(() => {
          try {
            stream.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, KOHARU_KEEPALIVE_MS);
      },
      cancel() {
        clearInterval(keepalive);
        if (controller) entry.streams.delete(controller);
        entry.touched = Date.now();
      },
    });
    return new Response(body, {
      headers: {
        ...noStore,
        "content-type": "text/event-stream; charset=utf-8",
        connection: "keep-alive",
      },
    });
  };

  const invoke = async (request: Request): Promise<Response> => {
    const id = request.headers.get(KOHARU_SESSION_HEADER) ?? "";
    if (!SESSION.test(id)) return json({ error: "missing or invalid koharu session" }, 400);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return json({ error: "request too large" }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "request too large" }, 413);
    let body: { command?: unknown; args?: unknown };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (typeof body.command !== "string" || !COMMAND.test(body.command))
      return json({ error: "invalid command" }, 400);
    session(id);
    const args = renumber(body.args ?? {}, (localId) => {
      for (const [channel, owner] of channels)
        if (owner.session === id && owner.local === localId) return channel;
      const channel = ++nextChannel;
      channels.set(channel, { session: id, local: localId });
      return channel;
    });
    let answer: { result?: unknown; error?: unknown };
    try {
      answer = await call(body.command, args);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 503);
    }
    if ("error" in answer && answer.error !== undefined)
      return json({ error: typeof answer.error === "string" ? answer.error : "engine error" }, 422);
    const result = answer.result;
    if (
      result &&
      typeof result === "object" &&
      "$bytes" in result &&
      typeof result.$bytes === "string"
    ) {
      return new Response(Buffer.from(result.$bytes, "base64"), {
        headers: { ...noStore, "content-type": "application/octet-stream" },
      });
    }
    return json({ result: result ?? null });
  };

  const sweeper = setInterval(sweep, 60_000);
  sweeper.unref?.();

  return {
    status() {
      if (o.disabled) return { available: false, reason: o.disabled };
      if (!o.binary) return { available: false, reason: "moteur koharu-sdk absent" };
      return { available: true };
    },
    setServerUrl(url) {
      serverUrl = url.replace(/\/+$/, "");
    },
    async handle(request, url, peer) {
      if (url.pathname !== KOHARU_PATH && !url.pathname.startsWith(`${KOHARU_PATH}/`)) return null;
      if (o.disabled || !o.binary)
        return json({ error: o.disabled ?? "koharu-sdk is not installed beside the server" }, 503);
      if (!local(request, url, peer))
        return json({ error: "the local editor engine answers this machine only" }, 403);
      if (url.pathname === `${KOHARU_PATH}/events` && request.method === "GET") {
        const id = url.searchParams.get("session") ?? "";
        if (!SESSION.test(id)) return json({ error: "missing or invalid koharu session" }, 400);
        return events(id);
      }
      if (url.pathname === `${KOHARU_PATH}/invoke` && request.method === "POST")
        return invoke(request);
      return json({ error: "unknown koharu route" }, 404);
    },
    stop() {
      clearInterval(sweeper);
      const child = engine;
      engine = null;
      if (child) {
        try {
          child.stdin.end?.();
        } catch {
          // already closed
        }
        child.kill();
      }
    },
  };
}
