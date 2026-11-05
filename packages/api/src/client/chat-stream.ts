// SPDX-License-Identifier: Apache-2.0
/**
 * Typed SSE chat stream of the Shenron contract (`endpoints.chat`, `chatResume`, `chatCancel`).
 *
 * `streamChat` posts a {@link ChatRequest} to `POST /api/v1/chat` and hands every validated
 * {@link ChatEvent} to `onEvent` as it arrives. The server numbers each frame (`id:`); when the
 * connection drops before `done`/`error`, the stream is resumed with `GET
 * /api/v1/chat/streams/{streamId}` and `Last-Event-ID: <last id>`, which replays what was missed
 * then follows the live tail (`packages/api/src/server/streams.ts`). The generation is detached
 * from the connection: aborting `signal` only stops reading; `cancelChat` stops the generation.
 *
 * Never throws: every call resolves to a {@link ChatStreamOutcome}. A 404/405/501 on the first
 * request means the chat group is not served by this host (the public site serves it nowhere,
 * the desktop host does): `kind: "unavailable"` lets the caller fall back.
 *
 * Runtime class: `pure` (no DOM global, no node:/bun:); `fetch` is injectable.
 */
import { z } from "zod";
import {
  ChatDone,
  ChatErrorEvent,
  ChatMeta,
  ChatToolEvent,
  Citation,
  type ChatEvent,
  type ChatRequest,
} from "../contract/chat";
import { endpoints, fillPath } from "../contract/endpoints";
import { ErrorEnvelope } from "../contract/error";

// ── SSE framing ─────────────────────────────────────────────────────────────

/** One dispatched server-sent event (WHATWG `text/event-stream`). */
export interface SseFrame {
  /** `event:` field, `message` when absent. */
  event: string;
  /** `data:` lines joined with `\n`. */
  data: string;
  /** `id:` field of this frame, when it carried one. */
  id?: string;
}

/**
 * Incremental `text/event-stream` parser: feed decoded text chunks in any split (a line, a
 * field or a CRLF may straddle two chunks), get the complete frames. Comments (`: keepalive`)
 * and `retry:` are ignored; a frame without data is not dispatched.
 */
export function createSseParser(): { push(chunk: string): SseFrame[]; flush(): SseFrame[] } {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  let id: string | undefined;

  const dispatch = (out: SseFrame[]) => {
    if (data.length > 0) {
      out.push({ event: event || "message", data: data.join("\n"), ...(id ? { id } : {}) });
    }
    event = "";
    data = [];
    id = undefined;
  };

  const line = (text: string, out: SseFrame[]) => {
    if (text === "") return dispatch(out);
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id" && !value.includes("\0")) id = value;
  };

  const drain = (final: boolean): SseFrame[] => {
    const out: SseFrame[] = [];
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch !== "\n" && ch !== "\r") continue;
      // A trailing CR may be the first half of a CRLF split across chunks.
      if (ch === "\r" && i === buffer.length - 1 && !final) break;
      line(buffer.slice(start, i), out);
      if (ch === "\r" && buffer[i + 1] === "\n") i++;
      start = i + 1;
    }
    buffer = buffer.slice(start);
    if (final) {
      if (buffer) line(buffer, out);
      buffer = "";
      dispatch(out);
    }
    return out;
  };

  return {
    push(chunk) {
      buffer += chunk;
      return drain(false);
    },
    flush: () => drain(true),
  };
}

// ── Chat events ─────────────────────────────────────────────────────────────

const EVENT_DATA: { [K in ChatEvent["type"]]: z.ZodType<Extract<ChatEvent, { type: K }>["data"]> } =
  {
    meta: ChatMeta,
    sources: z.object({ citations: z.array(Citation) }),
    tool: ChatToolEvent,
    backend: z.object({ backend: z.string(), model: z.string().nullable() }),
    delta: z.object({ text: z.string() }),
    done: ChatDone,
    error: ChatErrorEvent,
  };

/** The contract event of a frame, or `null` (unknown name, invalid JSON or invalid shape). */
export function parseChatEvent(frame: SseFrame): ChatEvent | null {
  if (!Object.hasOwn(EVENT_DATA, frame.event)) return null;
  const type = frame.event as ChatEvent["type"];
  let raw: unknown;
  try {
    raw = JSON.parse(frame.data);
  } catch {
    return null;
  }
  const parsed = EVENT_DATA[type].safeParse(raw);
  return parsed.success ? ({ type, data: parsed.data } as ChatEvent) : null;
}

// ── Stream client ───────────────────────────────────────────────────────────

export type ChatStreamOutcome =
  /** `done` received. */
  | { ok: true; streamId: string | null; done: ChatDone; resumes: number }
  /** The host does not serve the chat group (404/405/501 on the first request). */
  | { ok: false; kind: "unavailable"; status: number }
  /** Refused before streaming (400, 401, 429, 5xx…). */
  | {
      ok: false;
      kind: "http";
      status: number;
      detail: string;
      error?: ErrorEnvelope;
      retryAfterSeconds?: number;
    }
  /** The generation reported an `error` event. */
  | { ok: false; kind: "error"; streamId: string | null; error: ChatErrorEvent }
  /** `signal` aborted: reading stopped (the generation may still run, see `cancelChat`). */
  | { ok: false; kind: "aborted"; streamId: string | null; lastEventId: number }
  /** Network failure, or the stream could not be resumed. */
  | {
      ok: false;
      kind: "unreachable";
      streamId: string | null;
      lastEventId: number;
      detail: string;
    };

export interface ChatStreamOptions {
  /** Origin (and optional prefix) of the Shenron API, e.g. `location.origin`. */
  baseUrl: string | URL;
  fetch?: typeof fetch;
  /** Extra headers on every request (signed owner, acting user…). */
  headers?: Record<string, string> | (() => Record<string, string>);
  signal?: AbortSignal;
  /** Every validated event, with its frame number. */
  onEvent?: (event: ChatEvent, id: number) => void;
  /** Stream id as soon as the server announced it (`X-Stream-Id`), e.g. for `cancelChat`. */
  onStream?: (streamId: string) => void;
  /** Before each resumption attempt (1-based). */
  onResume?: (attempt: number, lastEventId: number) => void;
  /** Resumptions after a dropped connection (default 3). */
  maxResumes?: number;
  /** Delay before resumption `attempt` (default 400 ms × attempt). */
  resumeDelayMs?: (attempt: number) => number;
}

function joinUrl(baseUrl: string | URL, path: string): URL {
  const base = new URL(String(baseUrl));
  const prefix = base.pathname.replace(/\/+$/, "");
  return new URL(`${prefix}${path}`, base.origin);
}

function extraHeaders(options: ChatStreamOptions): Record<string, string> {
  const h = options.headers;
  return typeof h === "function" ? h() : (h ?? {});
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

const UNAVAILABLE = new Set([404, 405, 501]);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

async function refusal(response: Response): Promise<ChatStreamOutcome> {
  let error: ErrorEnvelope | undefined;
  try {
    const parsed = ErrorEnvelope.safeParse(await response.json());
    if (parsed.success) error = parsed.data;
  } catch {
    // not JSON
  }
  const retryAfter = Number(response.headers.get("retry-after"));
  return {
    ok: false,
    kind: "http",
    status: response.status,
    detail: error?.message ?? error?.error ?? `HTTP ${response.status}`,
    ...(error ? { error } : {}),
    ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
  };
}

type ReadResult =
  | { end: "done"; done: ChatDone }
  | { end: "error"; error: ChatErrorEvent }
  | { end: "dropped"; detail: string };

/** Reads one SSE body until `done`, `error` or the end of the connection. */
async function readBody(
  body: ReadableStream<Uint8Array>,
  options: ChatStreamOptions,
  cursor: { last: number },
): Promise<ReadResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  const handle = (frames: SseFrame[]): ReadResult | null => {
    for (const frame of frames) {
      const n = Number(frame.id);
      // A replayed frame already delivered (resumption overlap) is skipped.
      if (Number.isInteger(n) && n > 0) {
        if (n <= cursor.last) continue;
        cursor.last = n;
      }
      const event = parseChatEvent(frame);
      if (!event) continue;
      options.onEvent?.(event, cursor.last);
      if (event.type === "done") return { end: "done", done: event.data };
      if (event.type === "error") return { end: "error", error: event.data };
    }
    return null;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const ended = handle(parser.push(decoder.decode(value, { stream: true })));
      if (ended) return ended;
    }
    const ended = handle(parser.push(decoder.decode()).concat(parser.flush()));
    return ended ?? { end: "dropped", detail: "stream ended before done" };
  } catch (error) {
    return { end: "dropped", detail: describe(error) };
  } finally {
    try {
      await reader.cancel();
    } catch {
      // already released
    }
  }
}

/** Follows `body`, resuming through `chatResume` while the connection keeps dropping. */
async function follow(
  first: Response,
  streamId: string | null,
  options: ChatStreamOptions,
  cursor: { last: number },
): Promise<ChatStreamOutcome> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const maxResumes = options.maxResumes ?? 3;
  const delay = options.resumeDelayMs ?? ((attempt: number) => 400 * attempt);
  let response: Response | null = first;
  let failure = "empty body";
  let resumes = 0;
  while (true) {
    const result: ReadResult = response?.body
      ? await readBody(response.body, options, cursor)
      : { end: "dropped", detail: failure };
    if (result.end === "done") return { ok: true, streamId, done: result.done, resumes };
    if (result.end === "error") return { ok: false, kind: "error", streamId, error: result.error };
    if (options.signal?.aborted)
      return { ok: false, kind: "aborted", streamId, lastEventId: cursor.last };
    if (!streamId || resumes >= maxResumes) {
      return {
        ok: false,
        kind: "unreachable",
        streamId,
        lastEventId: cursor.last,
        detail: result.detail,
      };
    }
    resumes++;
    options.onResume?.(resumes, cursor.last);
    await sleep(delay(resumes), options.signal);
    if (options.signal?.aborted)
      return { ok: false, kind: "aborted", streamId, lastEventId: cursor.last };
    try {
      response = await fetcher(
        joinUrl(options.baseUrl, fillPath(endpoints.chatResume.path, { streamId })),
        {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            "Last-Event-ID": String(cursor.last),
            ...extraHeaders(options),
          },
          signal: options.signal,
        },
      );
    } catch (error) {
      if (options.signal?.aborted)
        return { ok: false, kind: "aborted", streamId, lastEventId: cursor.last };
      // Network still down: the next turn counts another attempt.
      response = null;
      failure = describe(error);
      continue;
    }
    if (!response.ok) {
      // 404: the stream expired (finished more than its retention ago) or belongs to another owner.
      return {
        ok: false,
        kind: "unreachable",
        streamId,
        lastEventId: cursor.last,
        detail: `resume refused: HTTP ${response.status}`,
      };
    }
  }
}

/** Starts a streamed chat generation and follows it to its end (see the module comment). */
export async function streamChat(
  request: ChatRequest,
  options: ChatStreamOptions,
): Promise<ChatStreamOutcome> {
  const fetcher = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(joinUrl(options.baseUrl, endpoints.chat.path), {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...extraHeaders(options),
      },
      body: JSON.stringify({ ...request, stream: true }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted)
      return { ok: false, kind: "aborted", streamId: null, lastEventId: 0 };
    return {
      ok: false,
      kind: "unreachable",
      streamId: null,
      lastEventId: 0,
      detail: describe(error),
    };
  }
  if (UNAVAILABLE.has(response.status)) {
    void response.body?.cancel().catch(() => undefined);
    return { ok: false, kind: "unavailable", status: response.status };
  }
  if (!response.ok) return refusal(response);
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    void response.body?.cancel().catch(() => undefined);
    return { ok: false, kind: "unavailable", status: response.status };
  }
  const streamId = response.headers.get("x-stream-id");
  if (streamId) options.onStream?.(streamId);
  return follow(response, streamId, options, { last: 0 });
}

/**
 * Re-attaches to a stream after `after` (a reload, another tab): replays the missed events,
 * then follows the live tail, resuming as {@link streamChat} does.
 */
export async function resumeChat(
  streamId: string,
  after: number,
  options: ChatStreamOptions,
): Promise<ChatStreamOutcome> {
  const fetcher = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(
      joinUrl(options.baseUrl, fillPath(endpoints.chatResume.path, { streamId })),
      {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Last-Event-ID": String(Math.max(0, after)),
          ...extraHeaders(options),
        },
        signal: options.signal,
      },
    );
  } catch (error) {
    if (options.signal?.aborted)
      return { ok: false, kind: "aborted", streamId, lastEventId: after };
    return {
      ok: false,
      kind: "unreachable",
      streamId,
      lastEventId: after,
      detail: describe(error),
    };
  }
  if (!response.ok) return refusal(response);
  return follow(response, streamId, options, { last: Math.max(0, after) });
}

/** Stops a running generation (`POST /api/v1/chat/streams/{streamId}/cancel`). */
export async function cancelChat(
  streamId: string,
  options: Pick<ChatStreamOptions, "baseUrl" | "fetch" | "headers">,
): Promise<boolean> {
  const fetcher = options.fetch ?? globalThis.fetch;
  try {
    const response = await fetcher(
      joinUrl(options.baseUrl, fillPath(endpoints.chatCancel.path, { streamId })),
      { method: "POST", headers: { Accept: "application/json", ...extraHeaders(options) } },
    );
    void response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}
