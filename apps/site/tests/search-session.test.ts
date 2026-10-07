import { expect, test } from "bun:test";
import { startSearchSession } from "../src/lib/search-session";

const pause = () => Bun.sleep(15);
test("replacement and disposal suppress responses even when fetch ignores abort", async () => {
  const values: string[] = [];
  let settle = 0;
  let resolve!: (value: string) => void;
  let oldSignal!: AbortSignal;
  const callbacks = {
    success: (value: string) => values.push(value),
    failure: () => values.push("failure"),
    settled: () => settle++,
  };
  const dispose = startSearchSession(
    (signal) => {
      oldSignal = signal;
      return new Promise<string>((done) => {
        resolve = done;
      });
    },
    callbacks,
    { debounceMs: 0 },
  );
  await pause();
  dispose();
  expect(oldSignal.aborted).toBe(true);
  const close = startSearchSession(async () => "new", callbacks, { debounceMs: 0 });
  await pause();
  resolve("old");
  await pause();
  expect(values).toEqual(["new"]);
  expect(settle).toBe(1);
  close();
});

test("a stalled request ends loading once and ignores its late result", async () => {
  let resolve!: (value: string) => void;
  const events: string[] = [];
  const dispose = startSearchSession(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
    {
      success: (value) => events.push(value),
      failure: () => events.push("error"),
      settled: () => events.push("settled"),
    },
    { debounceMs: 0, timeoutMs: 5 },
  );
  await pause();
  expect(events).toEqual(["error", "settled"]);
  resolve("late");
  await pause();
  expect(events).toEqual(["error", "settled"]);
  dispose();
});

test("closing during debounce prevents the request entirely", async () => {
  let calls = 0;
  const dispose = startSearchSession(
    async () => {
      calls++;
      return "value";
    },
    { success: () => {}, failure: () => {}, settled: () => {} },
    { debounceMs: 5 },
  );
  dispose();
  await pause();
  expect(calls).toBe(0);
});

test("rejected requests end loading and a new attempt can recover", async () => {
  const events: string[] = [];
  const callbacks = {
    success: (v: string) => events.push(v),
    failure: () => events.push("error"),
    settled: () => events.push("settled"),
  };
  const dispose = startSearchSession<string>(
    async () => {
      throw new Error("offline");
    },
    callbacks,
    { debounceMs: 0 },
  );
  await pause();
  dispose();
  const close = startSearchSession(async () => "recovered", callbacks, { debounceMs: 0 });
  await pause();
  expect(events).toEqual(["error", "settled", "recovered", "settled"]);
  close();
});
