import "./setup"; // must be first
import { afterEach, describe, expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import {
  RenderPool,
  RenderQueueFullError,
  RenderTimeoutError,
  closeRenderPool,
  configureRenderPool,
  getRenderPool,
  poolEnabled,
  renderCardOnPool,
  syncRenderWorkers,
  workerCount,
  type RenderPoolOptions,
} from "~/render/pool";
import { renderTierCard } from "~/render/cards/tier";
import { setPaletteOverrides } from "~/render/theme";
import { canvasNativeOk, decode, isPng } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

const stub = (name: string) => () =>
  new Worker(new URL(name, import.meta.url).href, { type: "module" });

const LABELS = { title: "Tier", level: "Level", newRole: "New" };
/** A tier card whose name drives the stub worker; a real renderer draws it when it falls back. */
const tier = (name: string) => ({
  name,
  avatarUrl: null,
  fromLevel: 1,
  toLevel: 2,
  labels: LABELS,
});

const pools: RenderPool[] = [];
const make = (options: RenderPoolOptions): RenderPool => {
  const pool = new RenderPool({ spawn: stub("./render-pool-stub-worker.ts"), ...options });
  pools.push(pool);
  return pool;
};
afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.close()));
  await closeRenderPool();
  configureRenderPool(null);
  setPaletteOverrides({});
  delete process.env.SHENRON_RENDER_POOL;
  delete process.env.SHENRON_RENDER_WORKERS;
});

describe("pool size", () => {
  test("min(cores - 1, setting), automatic without a setting, 0 turns the pool off", () => {
    expect(workerCount(undefined, 24)).toBe(23);
    expect(workerCount(null, 8)).toBe(7);
    expect(workerCount(4, 24)).toBe(4);
    expect(workerCount(64, 8)).toBe(7);
    expect(workerCount(0, 8)).toBe(0);
    expect(workerCount(3.9, 8)).toBe(3);
    expect(workerCount(-2, 8)).toBe(0);
    expect(workerCount(Number.NaN, 8)).toBe(7);
    expect(workerCount(undefined, 1)).toBe(1); // a single core keeps one worker
  });

  test("the shared pool is off under bun test, on when asked, and follows render.workers", async () => {
    expect(poolEnabled()).toBe(false);
    expect(getRenderPool()).toBeNull();
    process.env.SHENRON_RENDER_POOL = "1";
    expect(poolEnabled()).toBe(true);
    const pool = getRenderPool();
    expect(pool).not.toBeNull();
    expect(getRenderPool()).toBe(pool);
    expect(pool!.stats().size).toBe(workerCount(null));
    // the setting caps it, an empty or invalid one means automatic, 0 switches the pool off
    await syncRenderWorkers(async () => "2", Date.now() + 10 * 60_000);
    expect(getRenderPool()!.stats().size).toBe(Math.min(2, workerCount(null)));
    await syncRenderWorkers(async () => "0", Date.now() + 20 * 60_000);
    expect(poolEnabled()).toBe(false);
    expect(getRenderPool()).toBeNull();
    await syncRenderWorkers(async () => "not a number", Date.now() + 30 * 60_000);
    expect(poolEnabled()).toBe(true);
    // a read that fails keeps the size in force; reads are throttled to one a minute
    await syncRenderWorkers(async () => "1", Date.now() + 30 * 60_000 + 5_000);
    expect(getRenderPool()!.stats().size).toBe(workerCount(null));
    await syncRenderWorkers(
      async () => {
        throw new Error("db down");
      },
      Date.now() + 40 * 60_000,
    );
    expect(poolEnabled()).toBe(true);
  });
});

d("pool scheduling", () => {
  test("a worker answers like the in-line renderer and is reused", async () => {
    const pool = make({ size: 2 });
    const card = await pool.render("tier", tier("quick"));
    expect(isPng(card.buffer)).toBe(true);
    expect(card.contentType).toBe("image/png");
    expect(card.bytes).toBe(card.buffer.length);
    await pool.render("tier", tier("quick"));
    const stats = pool.stats();
    expect(stats.completed).toBe(2);
    expect(stats.workers).toBe(1); // sequential cards never need a second worker
    expect(stats.inlined).toBe(0);
  });

  test("cards run in parallel on several workers", async () => {
    const jobs = 4;
    const timed = async (size: number): Promise<number> => {
      const pool = make({ size });
      await pool.render("tier", tier("quick")); // start one worker before the clock
      pool.warm(size);
      await Bun.sleep(400); // the others become ready
      const started = performance.now();
      await Promise.all(Array.from({ length: jobs }, () => pool.render("tier", tier("spin"))));
      return performance.now() - started;
    };
    const serial = await timed(1);
    const parallel = await timed(4);
    // 4 cards of 150 ms: about 600 ms on one worker, about 150 ms on four
    expect(serial).toBeGreaterThan(520);
    expect(parallel).toBeLessThan(serial * 0.6);
    expect(parallel).toBeLessThan(420);
  });

  test("workers start on demand, up to the size, and idle ones above the first stop", async () => {
    const pool = make({ size: 3, idleMs: 120 });
    await Promise.all(Array.from({ length: 6 }, () => pool.render("tier", tier("spin"))));
    expect(pool.stats().workers).toBe(3);
    await Bun.sleep(500);
    expect(pool.stats().workers).toBe(1); // the first stays
    expect((await pool.render("tier", tier("quick"))).bytes).toBeGreaterThan(0);
  });

  test("a card that exceeds its deadline rejects and its worker is replaced", async () => {
    const pool = make({ size: 1, timeoutMs: 150 });
    const started = performance.now();
    await expect(pool.render("tier", tier("hang"))).rejects.toBeInstanceOf(RenderTimeoutError);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(pool.stats().timedOut).toBe(1);
    expect(pool.stats().workers).toBe(0);
    // the next card gets a fresh worker
    expect(isPng((await pool.render("tier", tier("quick"))).buffer)).toBe(true);
    expect(pool.stats().workers).toBe(1);
  });

  test("the queue is bounded: a full queue rejects at once", async () => {
    const pool = make({ size: 1, queueLimit: 2, timeoutMs: 400 });
    const first = pool.render("tier", tier("hang")).catch((error) => error);
    await Bun.sleep(50);
    const waiting = [
      pool.render("tier", tier("quick")).catch((error) => error),
      pool.render("tier", tier("quick")).catch((error) => error),
    ];
    await expect(pool.render("tier", tier("quick"))).rejects.toBeInstanceOf(RenderQueueFullError);
    expect(pool.stats().queued).toBe(2);
    // the hung card times out, then the waiting ones are served by a new worker
    expect(await first).toBeInstanceOf(RenderTimeoutError);
    const results = await Promise.all(waiting);
    for (const result of results) expect(isPng((result as { buffer: Buffer }).buffer)).toBe(true);
  });

  test("a worker that dies mid-card does not lose it: the card is drawn in line", async () => {
    const pool = make({ size: 1 });
    const card = await pool.render("tier", tier("crash"));
    // not the stub's 8 byte PNG: the real renderer drew a full card
    expect(isPng(card.buffer)).toBe(true);
    expect(card.width).toBe(2000);
    expect(card.height).toBe(800);
    const stats = pool.stats();
    expect(stats.inlined).toBe(1);
    expect(stats.workers).toBe(0);
    // and the pool keeps working with a new worker
    expect((await pool.render("tier", tier("quick"))).width).toBe(8);
  });

  test("without the fallback a death rejects", async () => {
    const pool = make({ size: 1, inlineFallback: false });
    await expect(pool.render("tier", tier("crash"))).rejects.toThrow();
  });

  test("workers that cannot start leave the pool in line mode, until reset", async () => {
    const pool = make({ size: 2, spawn: stub("./render-pool-stub-broken.ts") });
    for (let i = 0; i < 4; i++) {
      const card = await pool.render("tier", tier("quick"));
      expect(card.width).toBe(2000); // drawn in line by the real renderer
    }
    const stats = pool.stats();
    expect(stats.broken).toBe(true);
    expect(stats.inlined).toBe(4);
    expect(stats.workers).toBe(0);
    pool.reset();
    expect(pool.stats().broken).toBe(false);
  });

  test("a closed pool rejects and cancels what waits", async () => {
    const pool = make({ size: 1, timeoutMs: 5_000 });
    const hung = pool.render("tier", tier("hang")).catch((error) => error);
    await Bun.sleep(50);
    const waiting = pool.render("tier", tier("quick")).catch((error) => error);
    await pool.close();
    expect(await hung).toBeInstanceOf(Error);
    expect(await waiting).toBeInstanceOf(Error);
    await expect(pool.render("tier", tier("quick"))).rejects.toThrow("closed");
  });
});

d("pool with the real worker", () => {
  test("a card drawn on a worker equals the same card drawn in line", async () => {
    const pool = new RenderPool({ size: 2 });
    pools.push(pool);
    const input = {
      ...tier("Son Goku"),
      role: { label: "Super Saiyan", accent: "#f9ee54" },
    };
    const options = { locale: "fr" as const };
    const onWorker = await pool.render("tier", input, options);
    const inline = await renderTierCard(input, options);
    expect(isPng(onWorker.buffer)).toBe(true);
    expect(onWorker.width).toBe(inline.width);
    expect(onWorker.height).toBe(inline.height);
    const a = await decode(onWorker.buffer);
    const b = await decode(inline.buffer);
    let differing = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (Math.abs(a.data[i]! - b.data[i]!) > 2 || Math.abs(a.data[i + 1]! - b.data[i + 1]!) > 2) {
        differing++;
      }
    }
    // identical but for the avatar placeholder initial and font hinting
    expect(differing / (a.width * a.height)).toBeLessThan(0.01);
    expect(pool.stats().inlined).toBe(0);
  });

  test("avatars handed over in the job cost no download, the palette follows the main thread", async () => {
    const pool = new RenderPool({ size: 1 });
    pools.push(pool);
    const avatar = createCanvas(64, 64);
    const ctx = avatar.getContext("2d");
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(0, 0, 64, 64);
    const url = "https://invalid.example/avatar.png";
    const bytes = new Uint8Array(await avatar.encode("png"));
    const input = { ...tier("Avatar"), avatarUrl: url };
    const withAvatar = await pool.render("tier", input, {}, { inlineImages: { [url]: bytes } });
    const without = await pool.render("tier", { ...input, avatarUrl: null });
    const green = (card: { buffer: Buffer }) =>
      decode(card.buffer).then((pixels) => {
        let count = 0;
        for (let i = 0; i < pixels.data.length; i += 4) {
          if (pixels.data[i]! < 40 && pixels.data[i + 1]! > 230 && pixels.data[i + 2]! < 40)
            count++;
        }
        return count;
      });
    expect(await green(withAvatar)).toBeGreaterThan(20_000); // the green avatar disc
    expect(await green(without)).toBe(0);

    // the runtime theme of the main thread reaches the worker
    setPaletteOverrides({ bg: "#101080" });
    const themed = await pool.render("tier", { ...tier("Theme"), avatarUrl: null });
    const plain = await decode(without.buffer);
    const blue = await decode(themed.buffer);
    expect(blue.at(500, 40)).not.toEqual(plain.at(500, 40));
  });

  test("renderCardOnPool goes through the pool when it is on, in line when it is off", async () => {
    const inline = await renderCardOnPool("tier", tier("Inline"));
    expect(isPng(inline.buffer)).toBe(true);
    expect(getRenderPool()).toBeNull();
    process.env.SHENRON_RENDER_POOL = "1";
    configureRenderPool(2);
    const pooled = await renderCardOnPool("tier", tier("Pooled"));
    expect(isPng(pooled.buffer)).toBe(true);
    expect(getRenderPool()!.stats().completed).toBe(1);
    expect(getRenderPool()!.stats().inlined).toBe(0);
    // the image source of the in-line path is honoured, the workers never see it
    process.env.SHENRON_RENDER_POOL = "off";
    let asked = 0;
    await renderCardOnPool(
      "tier",
      { ...tier("Source"), avatarUrl: "https://x.example/a.png" },
      {},
      {
        images: {
          avatar: async () => {
            asked++;
            return null;
          },
          asset: async () => null,
        },
      },
    );
    expect(asked).toBe(1);
  });
});
