/* oxlint-disable eslint/no-unexpected-multiline -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "../src/contract";
import { ChatStreams, type NumberedEvent } from "../src/server/streams";
import { deltaEvent, doneEvent, metaEvent, scriptedChat, settle } from "./support/ports";

/** Start one scripted generation under `id` for `owner`. */
function started(streams: ChatStreams, id = "s0000001", owner = "alice") {
  const chat = scriptedChat();
  streams.start(
    id,
    owner,
    (signal) =>
      chat.port.run(
        { request: {} as never, ownerId: owner, streamId: id },
        signal,
      ) as AsyncIterable<ChatEvent>,
  );
  return chat.runs[0]!;
}

const ids = (events: NumberedEvent[]) => events.map((e) => e.id);

async function drain(iterator: AsyncIterable<NumberedEvent>): Promise<NumberedEvent[]> {
  const out: NumberedEvent[] = [];
  for await (const event of iterator) out.push(event);
  return out;
}

describe("ChatStreams", () => {
  test("numbers every event from 1 and replays a finished stream from the start", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"), deltaEvent("Son "), deltaEvent("Goku"), doneEvent());
    run.end();
    await settle();
    const events = await drain(streams.follow("s0000001", "alice"));
    expect(ids(events)).toEqual([1, 2, 3, 4]);
    expect(events.map((e) => e.event.type)).toEqual(["meta", "delta", "delta", "done"]);
  });

  test("after = n skips the events already delivered (Last-Event-ID semantics)", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"), deltaEvent("a"), deltaEvent("b"), doneEvent());
    run.end();
    await settle();
    expect(ids(await drain(streams.follow("s0000001", "alice", 2)))).toEqual([3, 4]);
    expect(ids(await drain(streams.follow("s0000001", "alice", 4)))).toEqual([]);
    expect(ids(await drain(streams.follow("s0000001", "alice", 99)))).toEqual([]);
  });

  test("replay then live tail without gap nor duplicate", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"), deltaEvent("a"));
    await settle();
    const follower = drain(streams.follow("s0000001", "alice"));
    await settle();
    run.push(deltaEvent("b"), doneEvent());
    run.end();
    expect(ids(await follower)).toEqual([1, 2, 3, 4]);
  });

  // Regression (fixed in b9458d0): the stream completed while the replay was suspended, and
  // the events recorded meanwhile were dropped.
  test("events recorded while the replay is suspended are delivered when the stream ends", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"), deltaEvent("a"));
    await settle();
    const iterator = streams.follow("s0000001", "alice")[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.id).toBe(1);
    // The consumer is suspended inside the replay of [1, 2]: the generation finishes now.
    run.push(deltaEvent("b"), doneEvent());
    run.end();
    await settle();
    const rest: number[] = [];
    for (let next = await iterator.next(); !next.done; next = await iterator.next())
      rest.push(next.value.id);
    expect(rest).toEqual([2, 3, 4]);
  });

  test("a generation that throws ends with a retryable internal error event", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"));
    run.fail(new Error("backend exploded"));
    await settle();
    const events = await drain(streams.follow("s0000001", "alice"));
    expect(events.at(-1)?.event).toEqual({
      type: "error",
      data: { code: "internal", message: "backend exploded", retryable: true },
    });
  });

  test("streams belong to their owner: has, follow and cancel refuse another one", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"));
    await settle();
    expect(streams.has("s0000001", "alice")).toBe(true);
    expect(streams.has("s0000001", "bob")).toBe(false);
    expect(streams.has("s0000404", "alice")).toBe(false);
    expect(await drain(streams.follow("s0000001", "bob"))).toEqual([]);
    expect(streams.cancel("s0000001", "bob")).toBe(false);
    expect(run.signal.aborted).toBe(false);
    expect(streams.cancel("s0000001", "alice")).toBe(true);
    expect(run.signal.aborted).toBe(true);
    await settle();
    // A finished stream cannot be cancelled again.
    expect(streams.cancel("s0000001", "alice")).toBe(false);
  });

  test("an already aborted signal yields nothing", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"));
    await settle();
    expect(await drain(streams.follow("s0000001", "alice", 0, AbortSignal.abort()))).toEqual([]);
  });

  // Regression: the abort was handled like the end of the stream, so the follower flushed
  // every queued event after its consumer had gone (duplicate relays, writes to closed sockets).
  test("aborting a live follower stops it at once, queued events included", async () => {
    const streams = new ChatStreams();
    const run = started(streams);
    run.push(metaEvent("s0000001"));
    await settle();
    const controller = new AbortController();
    const iterator = streams
      .follow("s0000001", "alice", 0, controller.signal)
      [Symbol.asyncIterator]();
    expect((await iterator.next()).value?.id).toBe(1);
    const pending = iterator.next();
    run.push(deltaEvent("a"));
    await settle();
    expect((await pending).value?.id).toBe(2);
    // Two more events wait in the follower's queue when the consumer leaves.
    run.push(deltaEvent("b"), deltaEvent("c"));
    await settle();
    controller.abort();
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    // The generation itself keeps running for a later resume.
    expect(run.signal.aborted).toBe(false);
    run.push(doneEvent());
    run.end();
    await settle();
    expect(ids(await drain(streams.follow("s0000001", "alice", 2)))).toEqual([3, 4, 5]);
  });

  test("finished streams expire after the TTL; the registry keeps at most maxStreams", async () => {
    let now = 1_000;
    const streams = new ChatStreams({ ttlMs: 100, maxStreams: 2, now: () => now });
    const first = started(streams, "s0000001");
    first.end();
    await settle();
    now += 101;
    started(streams, "s0000002");
    expect(streams.has("s0000001", "alice")).toBe(false);
    expect(streams.size).toBe(1);
    const second = started(streams, "s0000003");
    expect(streams.size).toBe(2);
    second.end();
    await settle();
    // Full: the oldest finished stream is evicted, a live one never is.
    started(streams, "s0000004");
    expect(streams.has("s0000002", "alice")).toBe(true);
    expect(streams.has("s0000003", "alice")).toBe(false);
    expect(streams.has("s0000004", "alice")).toBe(true);
  });
});
