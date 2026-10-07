// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { startHealthPolling } from "../src/public/health-poll";

test("a hung transport times out, recovers, and stops once available", async () => {
  let calls = 0;
  let errors = 0;
  const values: string[] = [];
  let signal: AbortSignal | undefined;
  const stop = startHealthPolling({
    timeoutMs: 10,
    intervalMs: 5,
    load: async (active) => {
      calls++;
      if (calls === 1) {
        signal = active;
        return new Promise<string>(() => {});
      }
      return "ready";
    },
    onUpdate: (value) => values.push(value),
    onError: () => errors++,
    shouldPoll: () => false,
  });
  try {
    const deadline = Date.now() + 1000;
    while (values.length === 0 && Date.now() < deadline) await Bun.sleep(5);
    expect(signal?.aborted).toBe(true);
    expect(errors).toBe(1);
    expect(values).toEqual(["ready"]);
    expect(calls).toBe(2);
  } finally {
    stop();
  }
});

test("slow responses do not accumulate polling requests", async () => {
  let calls = 0;
  let finish!: (value: boolean) => void;
  const stop = startHealthPolling({
    timeoutMs: 1000,
    intervalMs: 1,
    load: () => {
      calls++;
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    },
    onUpdate() {},
    onError() {},
    shouldPoll: () => false,
  });
  try {
    await Bun.sleep(30);
    expect(calls).toBe(1);
    finish(true);
    await Bun.sleep(10);
    expect(calls).toBe(1);
  } finally {
    stop();
  }
});

test("disposal aborts the request and ignores a late response without polling again", async () => {
  let resolve!: (value: string) => void;
  let signal!: AbortSignal;
  let updates = 0;
  let calls = 0;
  const stop = startHealthPolling({
    intervalMs: 1,
    timeoutMs: 10,
    load: (active) => {
      calls++;
      signal = active;
      return new Promise<string>((done) => {
        resolve = done;
      });
    },
    onUpdate: () => updates++,
    onError: () => updates++,
    shouldPoll: () => true,
  });
  stop();
  resolve("late");
  await Bun.sleep(30);
  expect(signal.aborted).toBe(true);
  expect(updates).toBe(0);
  expect(calls).toBe(1);
});
