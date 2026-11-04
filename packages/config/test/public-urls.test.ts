// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PUBLIC_ORIGINS,
  canonicalDbzAssetUrl,
  canonicalLegacyCdnAssetUrl,
  assetMirrorUrl,
  discordDefaultAvatar,
  joinUrl,
  originOf,
  resolveApiUrl,
  resolveAssetsUrl,
  resolveSiteUrl,
} from "../src/public-urls";

test("verified ADN media on the legacy worker retains its content path on the canonical CDN", () => {
  const path = "/adn/dc091e3b7b0940c8a6f3567b600be69736198f63d776224fb2fce12481e28d19.png";
  expect(
    canonicalLegacyCdnAssetUrl(`https://shenron-cdn.aphrody-labs.workers.dev${path}?v=2#frame`),
  ).toBe(`https://cdn.dragonballfr.com${path}?v=2#frame`);
  for (const source of [
    `https://foreign.workers.dev${path}`,
    `https://shenron-cdn.aphrody-labs.workers.dev/api/public/profile/1/card.png`,
    `https://user@shenron-cdn.aphrody-labs.workers.dev${path}`,
    `https://shenron-cdn.aphrody-labs.workers.dev/adn/not-a-content-hash.png`,
  ]) {
    expect(canonicalLegacyCdnAssetUrl(source)).toBeNull();
  }
});

describe("@aphrody/shenron-config/public-urls", () => {
  test("routes measured legacy DBZ artwork to its canonical CDN namespace", () => {
    for (const source of [
      "assets/dbz/characters/bulma.webp?v=1#frame",
      "./assets/dbz/characters/bulma.webp?v=1#frame",
      "/assets/dbz/characters/bulma.webp?v=1#frame",
      "https://cdn.dragonballfr.com/assets/dbz/characters/bulma.webp?v=1#frame",
      "https://bot.dragonballfr.com/assets/dbz/characters/bulma.webp?v=1#frame",
      "https://dragonballfr.com/assets/dbz/characters/bulma.webp?v=1#frame",
    ]) {
      expect(canonicalDbzAssetUrl(source)).toBe(
        "https://cdn.dragonballfr.com/assets/dbz/characters/bulma.webp?v=1#frame",
      );
    }
  });
  test("keeps runtime wiki uploads and foreign resources outside the DBZ mapping", () => {
    for (const source of [
      "./assets/wiki/characters/a.png",
      "/assets/manga/1.jpg",
      "https://foreign.test/assets/dbz/characters/bulma.webp",
      "https://user:password@cdn.dragonballfr.com/assets/dbz/characters/bulma.webp",
    ])
      expect(canonicalDbzAssetUrl(source)).toBeNull();
    expect(
      canonicalDbzAssetUrl(
        "./assets/dbz/characters/Bulma%20art.webp?x=%2F#scene",
        "https://bot.dragonballfr.com",
      ),
    ).toBe("https://cdn.dragonballfr.com/assets/dbz/characters/Bulma%20art.webp?x=%2F#scene");
    expect(canonicalDbzAssetUrl("/assets/dbz/characters/bulma.webp", "https://assets.test")).toBe(
      "https://assets.test/assets/dbz/characters/bulma.webp",
    );
  });
  test("preserves the public inventory namespace for CAS-only artwork", () => {
    expect(canonicalDbzAssetUrl("./assets/dbz/characters/Android19.webp")).toBe(
      "https://cdn.dragonballfr.com/assets/dbz/characters/Android19.webp",
    );
  });
  test("defaults apply with an empty environment", () => {
    expect(resolveSiteUrl({})).toBe(DEFAULT_PUBLIC_ORIGINS.site);
    expect(resolveApiUrl({})).toBe(DEFAULT_PUBLIC_ORIGINS.api);
    expect(resolveAssetsUrl({})).toBe(DEFAULT_PUBLIC_ORIGINS.api);
  });
  test("NEXT_PUBLIC mirror wins, then canonical, then legacy names", () => {
    expect(
      resolveApiUrl({
        NEXT_PUBLIC_SHENRON_API_URL: "https://a.test/",
        SHENRON_PUBLIC_API_URL: "https://b.test",
      }),
    ).toBe("https://a.test");
    expect(
      resolveApiUrl({ SHENRON_PUBLIC_API_URL: "https://b.test", API_PUBLIC_URL: "https://c.test" }),
    ).toBe("https://b.test");
    expect(resolveApiUrl({ API_PUBLIC_URL: " https://c.test// " })).toBe("https://c.test");
    expect(resolveSiteUrl({ SITE_PUBLIC_URL: "https://s.test" })).toBe("https://s.test");
    expect(
      resolveSiteUrl({ SHENRON_PUBLIC_SITE_URL: "", BETTER_AUTH_URL: "https://auth.test" }),
    ).toBe("https://auth.test");
  });
  test("assets fall back to the api origin", () => {
    expect(resolveAssetsUrl({ API_PUBLIC_URL: "https://api.test" })).toBe("https://api.test");
    expect(
      resolveAssetsUrl({
        API_PUBLIC_URL: "https://api.test",
        SHENRON_PUBLIC_ASSETS_URL: "https://cdn.test/x/",
      }),
    ).toBe("https://cdn.test/x");
  });
  test("joinUrl and originOf", () => {
    expect(joinUrl("https://h.test/", "/a/b")).toBe("https://h.test/a/b");
    expect(joinUrl("https://h.test/")).toBe("https://h.test");
    expect(originOf("https://h.test/a?b")).toBe("https://h.test");
    expect(originOf("nope")).toBe("nope");
  });
  test("assetMirrorUrl swaps cdn and api hosts only", () => {
    expect(
      assetMirrorUrl("https://cdn.test/assets/p.webp?v=1", "https://cdn.test", "https://api.test"),
    ).toBe("https://api.test/assets/p.webp?v=1");
    expect(
      assetMirrorUrl("https://api.test/assets/p.webp", "https://cdn.test", "https://api.test"),
    ).toBe("https://cdn.test/assets/p.webp");
    expect(
      assetMirrorUrl("https://other.test/x", "https://cdn.test", "https://api.test"),
    ).toBeNull();
    expect(assetMirrorUrl("not a url")).toBeNull();
  });
  test("discordDefaultAvatar", () => {
    expect(discordDefaultAvatar("0")).toBe("https://cdn.discordapp.com/embed/avatars/0.png");
    expect(discordDefaultAvatar("garbage")).toBe("https://cdn.discordapp.com/embed/avatars/0.png");
  });
});

describe("ownImageRemotePatterns and Discord helpers", () => {
  test("derives own origins, dedupes, keeps Discord media", async () => {
    const { ownImageRemotePatterns, discordUserAvatar, discordUserBanner, discordEmbedAvatar } =
      await import("../src/public-urls");
    const pats = ownImageRemotePatterns({
      SHENRON_PUBLIC_API_URL: "https://api.test",
      SHENRON_PUBLIC_SITE_URL: "https://site.test",
    });
    const keys = pats.map((p) => `${p.protocol}://${p.hostname}${p.pathname}`);
    expect(keys).toContain("https://api.test/db/**");
    expect(keys).toContain("https://api.test/assets/**");
    expect(keys).toContain("https://site.test/assets/**");
    expect(keys).toContain("https://cdn.discordapp.com/**");
    expect(keys).toContain("https://www.carddass.com/dbh/sdbh/**");
    expect(keys).toContain(
      "https://cdn.dragonballfr.com/publications/nozawa-yamaguchi-sdbh-ja/objects/**",
    );
    expect(keys).not.toContain("https://cdn.dragonballfr.com/publications/**");
    expect(pats.filter((p) => p.hostname === "www.carddass.com")).toEqual([
      { protocol: "https", hostname: "www.carddass.com", pathname: "/dbh/sdbh/**" },
    ]);
    // Full Color pages: the `/color/` path, and the former `/couleur/` stored in the database.
    expect(keys).toContain("https://api.test/api/public/manga/color/**");
    expect(keys).toContain("https://api.test/api/public/manga/couleur/**");
    expect(new Set(keys).size).toBe(keys.length);
    expect(discordUserAvatar("1", "a_x", { size: 64 })).toBe(
      "https://cdn.discordapp.com/avatars/1/a_x.gif?size=64",
    );
    expect(discordUserAvatar("1", "x")).toBe(
      "https://cdn.discordapp.com/avatars/1/x.webp?size=256",
    );
    expect(discordUserBanner("1", null)).toBeNull();
    expect(discordEmbedAvatar(3)).toBe("https://cdn.discordapp.com/embed/avatars/3.png");
  });
});

test("host URL is opt-in and drives the auth origin", async () => {
  const { resolveAuthUrl, resolveHostUrl } = await import("../src/public-urls");
  expect(resolveHostUrl({})).toBeUndefined();
  expect(resolveAuthUrl({ NEXT_PUBLIC_SITE_URL: "https://s.test" })).toBe("https://s.test");
  expect(resolveAuthUrl({ SHENRON_HOST_URL: "http://127.0.0.1:4000/" })).toBe(
    "http://127.0.0.1:4000",
  );
});
