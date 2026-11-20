// SPDX-License-Identifier: Apache-2.0
// The worker pool against the built library (SHENRON_FFI_DEV=1 after `cargo build -p
// shenron-ffi`, or SHENRON_FFI_LIB); skipped without one.
import { afterAll, describe, expect, test } from "bun:test";

import { resolveNativeLibraryPath, shenronJobCount, shenronLocalSearch } from "../src/engine";
import { SHENRON_STATUS } from "../src/generated/symbols";
import { ShenronJobError, ShenronWorkerPool } from "../src/worker";

function liveLibrary(): string | undefined {
  if (process.env.SHENRON_FFI_DEV !== "1" && !process.env.SHENRON_FFI_LIB) return undefined;
  try {
    return resolveNativeLibraryPath();
  } catch {
    return undefined;
  }
}
const library = liveLibrary();

describe("without a library", () => {
  test("a pool refuses to start", () => {
    if (library) return;
    expect(() => new ShenronWorkerPool({ path: "/nowhere/libshenron_ffi.so" })).toThrow(
      "Unable to load shenron-ffi",
    );
  });

  test("pool options are checked", () => {
    expect(() => new ShenronWorkerPool({ size: 0 })).toThrow(RangeError);
    expect(() => new ShenronWorkerPool({ maxQueue: -1 })).toThrow(RangeError);
  });
});

describe.if(library !== undefined)("ShenronWorkerPool with the built library", () => {
  const pools: ShenronWorkerPool[] = [];
  const pool = (size = 2, maxQueue?: number) => {
    const created = new ShenronWorkerPool({ path: library, size, maxQueue });
    pools.push(created);
    return created;
  };
  afterAll(async () => {
    await Promise.all(pools.map((created) => created.close()));
    expect(shenronJobCount()).toBe(0);
  });

  test("calls run concurrently on the workers, off the event loop", async () => {
    const workers = pool(4);
    await workers.sleep(0);
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 5);
    const started = performance.now();
    const values = await Promise.all(Array.from({ length: 8 }, () => workers.sleep(100)));
    const elapsed = performance.now() - started;
    clearInterval(timer);
    expect(values).toEqual(Array(8).fill(100));
    // 8 × 100 ms on 4 workers: two waves, not eight.
    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(elapsed).toBeLessThan(600);
    expect(ticks).toBeGreaterThan(10);
  });

  test("measures the latency of one call through a worker", async () => {
    const workers = pool(1);
    await workers.sleep(0);
    const started = performance.now();
    for (let i = 0; i < 1000; i++) await workers.sleep(0);
    const micros = ((performance.now() - started) / 1000) * 1000;
    console.log(`worker round trip (sleep 0): ${micros.toFixed(1)} µs per call`);
    expect(micros).toBeLessThan(5000);
  });

  test("the local search answers like the synchronous binding", async () => {
    const answer = await pool().localSearch("Son Goku", { limit: 3 });
    expect(answer).toEqual(shenronLocalSearch("Son Goku", 3));
  });

  test("a captured command runs on a worker", async () => {
    const run = await pool().runCaptured(["auth", "status", "--json"]);
    expect(run.code).toBe(0);
    expect(Object.keys(JSON.parse(run.stdout)).toSorted()).toEqual([
      "admin_credentials_present",
      "configured",
    ]);
  });

  test("a failed operation rejects with its status", async () => {
    const error = await pool()
      .ragSearch("x", { limit: 1 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShenronJobError);
    expect((error as ShenronJobError).status).toBe(SHENRON_STATUS.failed);
    expect((error as ShenronJobError).operation).toBe("rag_search");
  });

  test("abort cancels the native call at once and frees the worker", async () => {
    const workers = pool(1);
    await workers.sleep(0);
    const controller = new AbortController();
    const running = workers.sleep(60_000, { signal: controller.signal });
    await Bun.sleep(30);
    expect(workers.stats.busy).toBe(1);
    const aborted = performance.now();
    controller.abort();
    const reason = await running.catch((caught: unknown) => caught);
    const rejectedMs = performance.now() - aborted;
    expect((reason as DOMException).name).toBe("AbortError");
    // The single worker serves the next call once the cancelled native call returned.
    expect(await workers.sleep(0)).toBe(0);
    const freedMs = performance.now() - aborted;
    console.log(
      `cancellation: promise rejected in ${rejectedMs.toFixed(2)} ms, worker free in ${freedMs.toFixed(2)} ms`,
    );
    expect(rejectedMs).toBeLessThan(50);
    expect(freedMs).toBeLessThan(1000);
    expect(shenronJobCount()).toBe(0);
  });

  test("a queued call aborted before it starts never runs; an aborted signal rejects at once", async () => {
    const workers = pool(1);
    const first = workers.sleep(150);
    const controller = new AbortController();
    const queued = workers.sleep(60_000, { signal: controller.signal });
    expect(workers.stats.queued).toBe(1);
    controller.abort(new Error("changed my mind"));
    expect(await queued.catch((caught: unknown) => (caught as Error).message)).toBe(
      "changed my mind",
    );
    expect(workers.stats.queued).toBe(0);
    expect(await first).toBe(150);
    await expect(workers.sleep(1, { signal: AbortSignal.abort() })).rejects.toThrow();
  });

  test("a saturated pool refuses new calls", async () => {
    const workers = pool(1, 0);
    const busy = workers.sleep(50);
    await expect(workers.sleep(0)).rejects.toThrow("saturated");
    expect(await busy).toBe(50);
  });

  test("10 000 calls leave no registered job and no measurable RSS growth", async () => {
    const workers = pool(2);
    const batch = async () => {
      for (let wave = 0; wave < 10; wave++) {
        await Promise.all(Array.from({ length: 1000 }, () => workers.sleep(0)));
      }
      Bun.gc(true);
      // Main-thread GC does not collect worker heaps; allow their idle collection to run.
      await Bun.sleep(250);
      Bun.gc(true);
      return process.memoryUsage().rss;
    };
    // Worker heaps are collected on their own schedule: RSS breathes, a leak only grows. Four
    // batches of 10 000 calls; the lowest of the last two against the first.
    const rss = [await batch(), await batch(), await batch(), await batch()];
    const growthMb = (Math.min(rss[2] as number, rss[3] as number) - (rss[0] as number)) / 1048576;
    console.log(
      `worker pool: RSS per 10 000-call batch ${rss.map((v) => (v / 1048576).toFixed(1)).join(" → ")} MB`,
    );
    expect(growthMb).toBeLessThan(8);
    expect(shenronJobCount()).toBe(0);
  }, 60_000);

  test("close cancels the running calls and stops the workers", async () => {
    const workers = new ShenronWorkerPool({ path: library, size: 2 });
    const running = workers.sleep(60_000).catch((caught: unknown) => caught as DOMException);
    await Bun.sleep(20);
    const started = performance.now();
    await workers.close();
    expect(performance.now() - started).toBeLessThan(1500);
    expect(((await running) as DOMException).name).toBe("AbortError");
    expect(workers.closed).toBe(true);
    expect(workers.stats.workers).toBe(0);
    await expect(workers.sleep(0)).rejects.toThrow("closed");
    expect(shenronJobCount()).toBe(0);
  });
});
