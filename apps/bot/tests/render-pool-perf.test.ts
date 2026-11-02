import "./setup"; // must be first
import { afterAll, describe, expect, test } from "bun:test";
import { RenderPool, workerCount } from "~/render/pool";
import { renderInline, type CardInputs, type CardKind } from "~/render/dispatch";
import { PROFILE_LABELS, NAMES } from "~/render/fixtures";
import { canvasNativeOk } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

/** A mix of the cards the bot draws most: profiles, boards and tier-ups, no network. */
function workload(count: number): Array<{ kind: CardKind; input: CardInputs[CardKind] }> {
  const jobs: Array<{ kind: CardKind; input: CardInputs[CardKind] }> = [];
  for (let i = 0; i < count; i++) {
    const name = `${NAMES[i % NAMES.length]} ${i}`;
    if (i % 3 === 0) {
      jobs.push({
        kind: "profile",
        input: {
          name,
          xp: 5_000 + i * 977,
          zeni: 1_000 + i * 31,
          messages: 100 + i,
          rank: i + 1,
          race: { id: "saiyan", label: "Saiyan", emoji: "⚡" },
          tier: { label: "Super Saiyan" },
          backgrounds: [],
          labels: PROFILE_LABELS.fr,
        },
      });
    } else if (i % 3 === 1) {
      jobs.push({
        kind: "leaderboard",
        input: {
          title: `Classement ${i}`,
          unit: "XP",
          entries: NAMES.map((entry, rank) => ({
            id: `${rank}`,
            name: entry,
            value: 2_000_000 / (rank + 1 + i),
            caption: `Niveau ${30 - rank}`,
          })),
          pageLabel: "Page 1 / 3",
        },
      });
    } else {
      jobs.push({
        kind: "tier",
        input: {
          name,
          fromLevel: 10 + i,
          toLevel: 11 + i,
          role: { label: "Super Saiyan 2", accent: "#f9ee54" },
          labels: { title: "Palier franchi", level: "Niveau", newRole: "Nouvelle transformation" },
        },
      });
    }
  }
  return jobs;
}

const pools: RenderPool[] = [];
afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.close()));
});

/** Pool of `size` workers, all started before the clock. */
async function warmPool(size: number): Promise<RenderPool> {
  const pool = new RenderPool({ size, timeoutMs: 120_000, queueLimit: 10_000 });
  pools.push(pool);
  const warmup = workload(size * 2);
  await Promise.all(warmup.map((job) => pool.render(job.kind, job.input as never)));
  return pool;
}

async function throughput(pool: RenderPool, jobs: ReturnType<typeof workload>): Promise<number> {
  const started = performance.now();
  await Promise.all(jobs.map((job) => pool.render(job.kind, job.input as never)));
  return jobs.length / ((performance.now() - started) / 1000);
}

d("render pool throughput", () => {
  const cores = navigator.hardwareConcurrency || 1;
  const all = workerCount(null);

  test.skipIf(all < 2)(
    "every core renders more cards per second than one worker",
    { timeout: 180_000 },
    async () => {
      const jobs = workload(Math.max(48, all * 3));
      const one = await warmPool(1);
      const many = await warmPool(all);
      // best of two rounds each: a busy machine slows a round, never speeds it up
      const single = Math.max(await throughput(one, jobs), await throughput(one, jobs));
      const parallel = Math.max(await throughput(many, jobs), await throughput(many, jobs));
      const speedup = parallel / single;
      console.log(
        `render pool: ${cores} cores, ${jobs.length} cards: 1 worker ${single.toFixed(1)} cards/s, ` +
          `${all} workers ${parallel.toFixed(1)} cards/s (x${speedup.toFixed(1)})`,
      );
      expect(many.stats().workers).toBeGreaterThan(1);
      expect(many.stats().inlined + one.stats().inlined).toBe(0);
      if (all >= 4) expect(speedup).toBeGreaterThan(2);
      else if (all >= 2) expect(speedup).toBeGreaterThan(1.2);
    },
  );

  test(
    "the main thread keeps running while the cards are drawn",
    { timeout: 180_000 },
    async () => {
      const jobs = workload(Math.max(24, all * 2));
      const pool = await warmPool(Math.min(all, 8));

      /** Longest stall of the event loop, in ms, while `run` is in progress (5 ms ticks). */
      async function longestStall(run: () => Promise<unknown>): Promise<number> {
        let last = performance.now();
        let worst = 0;
        const timer = setInterval(() => {
          const now = performance.now();
          worst = Math.max(worst, now - last - 5);
          last = now;
        }, 5);
        await run();
        // a loop that never yielded did not tick at all: count the time since the last tick too
        worst = Math.max(worst, performance.now() - last - 5);
        clearInterval(timer);
        return worst;
      }

      let pooled = Infinity;
      let inline = 0;
      for (let attempt = 0; attempt < 3 && !(pooled < 100 && pooled < inline); attempt++) {
        pooled = await longestStall(() =>
          Promise.all(jobs.map((job) => pool.render(job.kind, job.input as never))),
        );
        inline = await longestStall(async () => {
          for (const job of jobs.slice(0, 6)) await renderInline(job.kind, job.input as never);
        });
      }
      console.log(
        `event loop stall while drawing ${jobs.length} cards: ${pooled.toFixed(0)} ms on the pool, ` +
          `${inline.toFixed(0)} ms drawing 6 cards in line`,
      );
      // a card drawn in line blocks the thread for the whole card; on the pool it never does
      expect(inline).toBeGreaterThan(30);
      expect(pooled).toBeLessThan(100);
      expect(pooled).toBeLessThan(inline);
    },
  );
});
