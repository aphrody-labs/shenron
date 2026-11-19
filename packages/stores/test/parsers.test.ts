// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { parseResult as appstoreResult } from "../src/appstore";
import { parseApp } from "../src/fdroid";
import { ShapeError, asObject } from "../src/guard";
import { parseResult as microsoftResult } from "../src/microsoft";
import { isDragonBall } from "../src/relevance";
import { parseSearchItem, steamDate } from "../src/steam";
import type { StoreListing } from "../src/types";

describe("steam", () => {
  test("search item with a price", () => {
    const listing = parseSearchItem(
      { type: "app", name: "DRAGON BALL XENOVERSE 3", id: 1857810, price: { currency: "USD", initial: 6999, final: 6999 }, platforms: { windows: true, mac: false, linux: false } },
      "item",
      "us",
    );
    expect(listing).toMatchObject({ store: "steam", storeId: "1857810", region: "us", platforms: ["windows"], addon: false });
    expect(listing.price).toEqual({ amount: 69.99, currency: "USD", formatted: null, free: false });
  });

  test("a pack is an add-on", () => {
    expect(parseSearchItem({ name: "DRAGON BALL XENOVERSE 2 - Dragon Ball DAIMA Pack", id: 3387210 }, "item", "us").addon).toBe(true);
  });

  test("dates in both Steam orders and an ISO date", () => {
    expect(steamDate("10 Sep, 2025")).toBe("2025-09-10");
    expect(steamDate("Sep 10, 2025")).toBe("2025-09-10");
    expect(steamDate("2025-09-10")).toBe("2025-09-10");
    expect(steamDate("Coming soon")).toBeNull();
  });

  test("a missing id is an error that names the path", () => {
    expect(() => parseSearchItem({ name: "x" }, "steam.items[3]", "us")).toThrow("steam.items[3].id");
  });
});

describe("appstore", () => {
  test("result", () => {
    const listing = appstoreResult(
      { trackId: 6744439943, trackName: "ドラゴンボール ゲキシン スクアドラ", sellerName: "Bandai Namco Entertainment Inc.", artistName: "Bandai Namco Entertainment Inc.", releaseDate: "2025-09-10T07:00:00Z", price: 0, currency: "JPY", formattedPrice: "無料", trackViewUrl: "https://apps.apple.com/jp/app/id6744439943" },
      "r",
      "jp",
    );
    expect(listing).toMatchObject({ store: "appstore", storeId: "6744439943", releaseDate: "2025-09-10", platforms: ["iOS"], publisher: "Bandai Namco Entertainment Inc." });
    expect(listing.price?.free).toBe(true);
  });
});

describe("fdroid", () => {
  test("package name comes from the app URL", () => {
    const listing = parseApp({ name: "DBZ Battery Widget", url: "https://f-droid.org/en/packages/com.tomer.dbz.widget" }, "a");
    expect(listing.storeId).toBe("com.tomer.dbz.widget");
    expect(listing.price?.free).toBe(true);
  });
});

describe("microsoft", () => {
  test("search result", () => {
    const listing = microsoftResult(
      { ProductId: "9NZTSFKR9M94", Title: "DRAGON BALL FIGHTERZ (Windows)", DisplayPrice: "$59.99", Price: 59.99, AverageRating: 3.6, RatingsCount: 329, PublisherName: "BANDAI NAMCO Entertainment America Inc." },
      "r",
      "us",
    );
    expect(listing).toMatchObject({ storeId: "9NZTSFKR9M94", platforms: ["Windows"], rating: 3.6, ratingCount: 329 });
    expect(listing.price).toEqual({ amount: 59.99, currency: null, formatted: "$59.99", free: false });
  });
});

describe("relevance", () => {
  const base: Omit<StoreListing, "title" | "publisher"> = { store: "steam", storeId: "1", region: "us", url: "", developer: null, releaseDate: null, platforms: [], price: null, rating: null, ratingCount: null, addon: false };
  test("franchise title from a rights holder passes", () => {
    expect(isDragonBall({ ...base, title: "DRAGON BALL Z: KAKAROT", publisher: "Bandai Namco Entertainment" })).toBe(true);
    expect(isDragonBall({ ...base, title: "ドラゴンボール レジェンズ", publisher: "Bandai Namco Entertainment Inc." })).toBe(true);
  });
  test("a clone from an unrelated publisher is rejected", () => {
    expect(isDragonBall({ ...base, title: "Stickman Dragon Ball Fight", publisher: "Huyen Pham" })).toBe(false);
  });
  test("an unrelated Bandai Namco title is rejected", () => {
    expect(isDragonBall({ ...base, title: "ELDEN RING", publisher: "Bandai Namco Entertainment" })).toBe(false);
  });
  test("a store without a publisher keeps franchise-titled tools", () => {
    expect(isDragonBall({ ...base, store: "fdroid", title: "DBZ Battery Widget", publisher: null })).toBe(false);
    expect(isDragonBall({ ...base, store: "fdroid", title: "Dragon Ball Tracker", publisher: null })).toBe(true);
  });
});

describe("guard", () => {
  test("a wrong shape names the path", () => {
    expect(() => asObject([], "root")).toThrow(ShapeError);
    expect(() => asObject(null, "root.items")).toThrow("root.items: expected object, got null");
  });
});
