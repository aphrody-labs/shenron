// SPDX-License-Identifier: Apache-2.0
/**
 * Resumable chat streams: every event of a generation is numbered and buffered for a while,
 * so a client that lost its connection resumes with `Last-Event-ID` (SSE) or
 * `{ type: "resume", streamId, after }` (WebSocket) and receives what it missed, then the
 * live tail. The generation itself is detached from any single connection; an explicit
 * cancel aborts it. Runtime class: `pure`.
 */
import type { ChatEvent } from "../contract/chat";

export interface NumberedEvent {
  id: number;
  event: ChatEvent;
}

interface Stream {
  id: string;
  ownerId: string;
  events: NumberedEvent[];
  done: boolean;
  listeners: Set<(event: NumberedEvent | null) => void>;
  abort: AbortController;
  expiresAt: number;
}

export interface StreamRegistryOptions {
  /** Retention after completion (default 5 min). */
  ttlMs?: number;
  /** Streams kept at most (oldest finished ones are evicted first; default 256). */
  maxStreams?: number;
  now?: () => number;
}

export class ChatStreams {
  readonly #streams = new Map<string, Stream>();
  readonly #ttl: number;
  readonly #max: number;
  readonly #now: () => number;

  constructor(options: StreamRegistryOptions = {}) {
    this.#ttl = options.ttlMs ?? 5 * 60_000;
    this.#max = options.maxStreams ?? 256;
    this.#now = options.now ?? Date.now;
  }

  #sweep(): void {
    const now = this.#now();
    for (const [id, stream] of this.#streams)
      if (stream.done && stream.expiresAt < now) this.#streams.delete(id);
    if (this.#streams.size < this.#max) return;
    for (const [id, stream] of this.#streams) {
      if (this.#streams.size < this.#max) break;
      if (stream.done) this.#streams.delete(id);
    }
  }

  /** Start buffering the events of `source` under a new stream id. */
  start(
    id: string,
    ownerId: string,
    run: (signal: AbortSignal) => AsyncIterable<ChatEvent>,
  ): { id: string; signal: AbortSignal } {
    this.#sweep();
    const stream: Stream = {
      id,
      ownerId,
      events: [],
      done: false,
      listeners: new Set(),
      abort: new AbortController(),
      expiresAt: Number.POSITIVE_INFINITY,
    };
    this.#streams.set(id, stream);
    void (async () => {
      try {
        for await (const event of run(stream.abort.signal)) this.#push(stream, event);
      } catch (error) {
        this.#push(stream, {
          type: "error",
          data: {
            code: "internal",
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        });
      } finally {
        stream.done = true;
        stream.expiresAt = this.#now() + this.#ttl;
        for (const listener of stream.listeners) listener(null);
        stream.listeners.clear();
      }
    })();
    return { id, signal: stream.abort.signal };
  }

  #push(stream: Stream, event: ChatEvent): void {
    const numbered = { id: stream.events.length + 1, event };
    stream.events.push(numbered);
    for (const listener of stream.listeners) listener(numbered);
  }

  has(id: string, ownerId: string): boolean {
    return this.#streams.get(id)?.ownerId === ownerId;
  }

  cancel(id: string, ownerId: string): boolean {
    const stream = this.#streams.get(id);
    if (!stream || stream.ownerId !== ownerId || stream.done) return false;
    stream.abort.abort(new DOMException("cancelled by the client", "AbortError"));
    return true;
  }

  /** Events after `after` (0 = from the start), then the live tail until the stream ends. */
  async *follow(
    id: string,
    ownerId: string,
    after = 0,
    signal?: AbortSignal,
  ): AsyncGenerator<NumberedEvent> {
    const stream = this.#streams.get(id);
    if (!stream || stream.ownerId !== ownerId || signal?.aborted) return;
    const queue: (NumberedEvent | null)[] = [];
    let wake: (() => void) | null = null;
    const listener = (event: NumberedEvent | null) => {
      queue.push(event);
      wake?.();
    };
    // Subscribe before replaying so no event falls between the two.
    if (!stream.done) stream.listeners.add(listener);
    const onAbort = () => listener(null);
    signal?.addEventListener("abort", onAbort, { once: true });
    // An aborted follower stops at once: nothing is replayed or flushed after the abort.
    const stopped = () => signal?.aborted === true;
    try {
      let last = after;
      for (const numbered of stream.events.slice(after)) {
        last = numbered.id;
        yield numbered;
        if (stopped()) return;
      }
      if (stream.done) {
        // Completed while the replay was suspended: deliver what came after the snapshot.
        for (const numbered of stream.events.slice(last)) {
          yield numbered;
          if (stopped()) return;
        }
        return;
      }
      while (true) {
        while (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
        const next = queue.shift()!;
        if (stopped()) return;
        if (next === null) {
          // Flush anything recorded after the last delivered event (completion race).
          for (const numbered of stream.events.slice(last)) {
            yield numbered;
            if (stopped()) return;
          }
          return;
        }
        if (next.id <= last) continue;
        last = next.id;
        yield next;
      }
    } finally {
      stream.listeners.delete(listener);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  get size(): number {
    return this.#streams.size;
  }
}
