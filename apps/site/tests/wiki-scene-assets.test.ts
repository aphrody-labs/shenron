// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { PORTAL_ANIME_FRAMES, PORTAL_MASCOTS } from "../src/components/wiki/scene/portal-artwork";
import { HOME_HERO_FRAMES } from "../src/lib/home-hero-frames";

test("the three faithful mascot files match their source hashes and native PNG dimensions", async () => {
  expect(PORTAL_MASCOTS.map((asset) => asset.id)).toEqual(["goku", "kid-buu", "shenron"]);
  for (const asset of PORTAL_MASCOTS) {
    expect(asset.src.startsWith("/wiki-scene/")).toBe(true);
    const file = Bun.file(new URL(`../public${asset.src}`, import.meta.url));
    const bytes = await file.bytes();
    expect(Bun.CryptoHasher.hash("sha256", bytes, "hex")).toBe(asset.sha256);
    expect(new URL(asset.source).protocol).toBe("https:");
    const decoded = await new Bun.Image(bytes, { maxPixels: 16_000_000 }).metadata();
    expect(decoded.format).toBe("png");
    expect(decoded.width).toBe(asset.width);
    expect(decoded.height).toBe(asset.height);
  }
});

test("decorative stills reuse homepage sources and exclude the inspected subtitled poster", () => {
  expect(PORTAL_ANIME_FRAMES).toHaveLength(3);
  expect(new Set(PORTAL_ANIME_FRAMES.map((frame) => frame.src)).size).toBe(3);
  for (const frame of PORTAL_ANIME_FRAMES) {
    expect(HOME_HERO_FRAMES).toContain(frame);
    expect(new URL(frame.src).origin).toBe("https://cdn.dragonballfr.com");
    expect(frame.width).toBeGreaterThanOrEqual(1280);
    expect(frame.height).toBeGreaterThanOrEqual(720);
  }
  expect(
    PORTAL_ANIME_FRAMES.some((frame) => frame.episodeId === 876 && frame.timecodeSec === 240),
  ).toBe(false);
});
