import { describe, expect, test } from "bun:test";
import { assetUrl } from "../src/lib/assets";
import { ownImageRemotePatterns } from "@aphrody/shenron-config/public-urls";

describe("canonical public DBZ artwork", () => {
  test("verified legacy worker ADN media resolves through the same public asset owner", () => {
    const path = "/adn/dc091e3b7b0940c8a6f3567b600be69736198f63d776224fb2fce12481e28d19.png";
    expect(assetUrl(`https://shenron-cdn.aphrody-labs.workers.dev${path}?v=2#frame`)).toBe(
      `https://cdn.dragonballfr.com${path}?v=2#frame`,
    );
    expect(assetUrl(`https://foreign.workers.dev${path}`)).toBe(
      `https://foreign.workers.dev${path}`,
    );
    expect(ownImageRemotePatterns({})).toContainEqual({
      protocol: "https",
      hostname: "cdn.dragonballfr.com",
      pathname: "/adn/*.png",
    });
  });
  test("normalizes every owned legacy spelling without dropping query or fragment", () => {
    for (const source of [
      "./assets/dbz/characters/bulma.webp",
      "assets/dbz/characters/bulma.webp",
      "/assets/dbz/characters/bulma.webp",
      "https://cdn.dragonballfr.com/assets/dbz/characters/bulma.webp",
      "https://bot.dragonballfr.com/assets/dbz/characters/bulma.webp",
      "https://dragonballfr.com/assets/dbz/characters/bulma.webp",
    ])
      expect(assetUrl(`${source}?v=2#frame`)).toBe(
        "https://cdn.dragonballfr.com/assets/dbz/characters/bulma.webp?v=2#frame",
      );
  });
  test("preserves wiki uploads, manga scans and foreign providers", () => {
    expect(assetUrl("/assets/manga/a.jpg")).toBe("/assets/manga/a.jpg");
    expect(assetUrl("/wiki/characters/a.png")).toBe("/wiki/characters/a.png");
    expect(assetUrl("https://foreign.test/assets/dbz/a.webp")).toBe(
      "https://foreign.test/assets/dbz/a.webp",
    );
    expect(assetUrl("./assets/wiki/characters/a.png")).toContain("/assets/wiki/characters/a.png");
  });
  test("allows the canonical CDN namespace through the shared Next image contract", () => {
    expect(ownImageRemotePatterns({})).toContainEqual({
      protocol: "https",
      hostname: "cdn.dragonballfr.com",
      pathname: "/dbz/**",
    });
  });
});
