/**
 * The leaderboard and fusion canvases never ask for a NASA background that is not on the
 * image: they use a built-in banner, else their gradient, and log nothing about it.
 */
import "./setup"; // must be first
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { logger } from "~/lib/logger";
import { BackgroundCacheService } from "~/services/BackgroundCacheService";
import { FusionService } from "~/services/FusionService";
import { LeaderboardService } from "~/services/LeaderboardService";

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(logger, "warn");
});
afterEach(() => warn.mockRestore());

const NASA_NEBULA = "assets/backgrounds/nebula/weighing-in-on-the-dumbbell-nebula.webp";
const NASA_AURORA = "assets/backgrounds/aurora/aurora-borealis-at-kennedy-space-center.webp";

/** Cache double that knows only `present` and records every file it is asked to load. */
function cacheWith(present: string[]) {
  const loaded: string[] = [];
  const real = new BackgroundCacheService();
  const cache = Object.assign(real, {
    exists: (path: string) => present.includes(path),
    get: async (path: string) => {
      loaded.push(path);
      return null;
    },
  });
  return { cache, loaded };
}

type WithLoader = { loadBg(): Promise<unknown> };

describe("background candidates", () => {
  test("the first candidate on disk wins, none gives null", () => {
    const cache = new BackgroundCacheService();
    expect(cache.firstAvailable([NASA_NEBULA, "assets/banners/banner-02.jpg"])).toBe(
      "assets/banners/banner-02.jpg",
    );
    expect(cache.firstAvailable([NASA_NEBULA, NASA_AURORA])).toBeNull();
    expect(cache.firstAvailable([])).toBeNull();
  });

  test("the NASA files are not shipped, the fallback banners are", () => {
    const cache = new BackgroundCacheService();
    expect(cache.exists(NASA_NEBULA)).toBe(false);
    expect(cache.exists(NASA_AURORA)).toBe(false);
    expect(cache.exists("assets/banners/banner-02.jpg")).toBe(true);
    expect(cache.exists("assets/banners/banner-15.jpg")).toBe(true);
  });
});

describe("leaderboard canvas", () => {
  test("loads the built-in banner, without a warning", async () => {
    const cache = new BackgroundCacheService();
    const service = new LeaderboardService(cache);
    await (service as unknown as WithLoader).loadBg();
    expect(cache.stats().paths).toEqual(["assets/banners/banner-02.jpg"]);
    expect(warn).not.toHaveBeenCalled();
  });

  test("falls back to the gradient and never requests an absent file", async () => {
    const { cache, loaded } = cacheWith([]);
    const service = new LeaderboardService(cache);
    expect(await (service as unknown as WithLoader).loadBg()).toBeNull();
    expect(loaded).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  test("uses the preferred image when it is shipped", async () => {
    const { cache, loaded } = cacheWith([NASA_NEBULA, "assets/banners/banner-02.jpg"]);
    await (new LeaderboardService(cache) as unknown as WithLoader).loadBg();
    expect(loaded).toEqual([NASA_NEBULA]);
  });
});

describe("fusion canvas", () => {
  const dbs = {} as never;

  test("loads the built-in banner, without a warning", async () => {
    const cache = new BackgroundCacheService();
    const service = new FusionService(cache, dbs);
    await (service as unknown as WithLoader).loadBg();
    expect(cache.stats().paths).toEqual(["assets/banners/banner-15.jpg"]);
    expect(warn).not.toHaveBeenCalled();
  });

  test("falls back to the gradient and never requests an absent file", async () => {
    const { cache, loaded } = cacheWith([]);
    const service = new FusionService(cache, dbs);
    expect(await (service as unknown as WithLoader).loadBg()).toBeNull();
    expect(loaded).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  test("repeated renders do not log either", async () => {
    const cache = new BackgroundCacheService();
    const service = new FusionService(cache, dbs);
    for (let i = 0; i < 3; i++) await (service as unknown as WithLoader).loadBg();
    expect(warn).not.toHaveBeenCalled();
  });
});
