import "./setup";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { DatabaseService } from "../src/db/index";
import { cardThemes } from "../src/db/schema";
import { logger } from "../src/lib/logger";
import { BackgroundCacheService } from "../src/services/BackgroundCacheService";
import { CardService } from "../src/services/CardService";

let warn: ReturnType<typeof spyOn>;
beforeEach(() => {
  warn = spyOn(logger, "warn");
});
afterEach(() => warn.mockRestore());

const warnedThemes = () =>
  warn.mock.calls
    .filter((call: unknown[]) => String(call.at(-1)).includes("card theme background missing"))
    .map((call: unknown[]) => (call[0] as { theme: string }).theme);

describe("card themes never reference a background that is not on disk", () => {
  test("migration 0007 seeds NASA backgrounds that are not shipped", () => {
    const rows = new DatabaseService().sqlite
      .query("SELECT id, bg_file FROM card_themes WHERE bg_file LIKE 'assets/backgrounds/%'")
      .all() as { id: string; bg_file: string }[];
    const cache = new BackgroundCacheService();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    // The shipped set is banners and fonts only: this is the production situation.
    expect(rows.every((row) => !cache.exists(row.bg_file))).toBe(true);
  });

  test("a seeded theme falls back to its built-in banner, which exists", async () => {
    const cards = new CardService(new BackgroundCacheService());
    const theme = await cards.describeCard("default");
    // `assets/backgrounds/sun/close-up-view-of-an-active-region-of-the.webp` in the database.
    expect(theme?.bgFile).toBe("assets/banners/banner-17.jpg");
    expect(new BackgroundCacheService().exists(theme!.bgFile!)).toBe(true);
    for (const id of ["goku", "vegeta", "kaio", "ssj", "blue", "rose", "ultra"]) {
      const bg = (await cards.describeCard(id))?.bgFile;
      expect(bg, id).toBeDefined();
      expect(bg!.startsWith("assets/banners/"), id).toBe(true);
    }
  });

  test("a custom theme with a missing background renders its gradient instead", async () => {
    const dbs = new DatabaseService();
    await dbs.db
      .insert(cardThemes)
      .values({
        id: "custom-missing",
        name: "Custom",
        accent: "#ffffff",
        aura: "#ffffff",
        bgGrad1: "#000000",
        bgGrad2: "#111111",
        bgGrad3: "#222222",
        bgFile: "assets/backgrounds/nebula/ant-nebula.webp",
        textShadow: "rgba(0,0,0,0.8)",
      })
      .onConflictDoNothing();
    const cards = new CardService(new BackgroundCacheService());
    expect((await cards.describeCard("custom-missing"))?.bgFile).toBeUndefined();
  });

  test("the missing files are reported once, not on every refresh", async () => {
    const cards = new CardService(new BackgroundCacheService());
    await cards.describeCard("default");
    const first = warnedThemes().length;
    expect(first).toBeGreaterThanOrEqual(8);
    cards.invalidateThemes();
    await cards.describeCard("default");
    expect(warnedThemes().length).toBe(first);
    expect(cards.missingBackgrounds().map((entry) => entry.theme)).toContain("default");
  });

  test("an unavailable background loads as null without being proposed", async () => {
    const cache = new BackgroundCacheService();
    expect(
      await cache.get("assets/backgrounds/sun/close-up-view-of-an-active-region-of-the.webp"),
    ).toBeNull();
  });
});
