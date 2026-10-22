import "./setup";
import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { logger } from "~/lib/logger";
import { BackgroundCacheService } from "~/services/BackgroundCacheService";

const warn = spyOn(logger, "warn");
afterEach(() => warn.mockClear());

describe("cache des fonds de canvas", () => {
  test("une sonde optionnelle absente ne journalise pas d'avertissement", async () => {
    const cache = new BackgroundCacheService();
    expect(await cache.get("assets/cards/absent-probe.webp", { optional: true })).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test("un fond attendu absent reste signalé", async () => {
    const cache = new BackgroundCacheService();
    expect(await cache.get("assets/backgrounds/absent-expected.webp")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
