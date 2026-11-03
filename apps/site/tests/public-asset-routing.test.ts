import { describe, expect, test } from "bun:test";
import { assetUrl } from "../src/lib/assets";
import { ownImageRemotePatterns } from "@aphrody/shenron-config/public-urls";
import { CDN_ORIGIN, SITE_URL } from "../src/lib/config";

describe("wiki catalogue artwork routing", () => {
  test("legacy wiki and external catalogue mirrors use the CDN in every owned spelling", () => {
    for (const path of ["wiki/characters/c926.png", "ext/episodes/154.jpg"]) {
      for (const prefix of [
        "assets/",
        "./assets/",
        "/assets/",
        "https://bot.dragonballfr.com/assets/",
        "https://dragonballfr.com/assets/",
      ]) {
        expect(assetUrl(`${prefix}${path}?v=2#art`)).toBe(`${CDN_ORIGIN}/assets/${path}?v=2#art`);
      }
    }
  });
  test("runtime uploads retain their site owner and query parameters", () => {
    const path = "/assets/wiki/items/55b2d3a4-5c67-4890-8abc-df0123456789.webp?width=800#art";
    expect(assetUrl(path)).toBe(`${SITE_URL}${path}`);
    expect(assetUrl(`https://bot.dragonballfr.com${path}`)).toBe(`${SITE_URL}${path}`);
  });
  test("foreign providers and local manga scans keep their original URLs", () => {
    for (const path of [
      "https://foreign.test/assets/ext/a.jpg?signature=opaque#art",
      "/assets/manga/volume-1/page-1.jpg?v=2#page",
    ]) {
      expect(assetUrl(path)).toBe(path);
    }
  });
});

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
