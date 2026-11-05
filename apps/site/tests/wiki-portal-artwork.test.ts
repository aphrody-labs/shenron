// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  wikiPortalArtwork,
  wikiPortalMascots,
  portalFeaturedKey,
  portalArtworkUrl,
  recentPortalPublications,
} from "../src/lib/wiki-portal-artwork";

const catalogue = () => ({
  characters: [],
  transformations: [],
  sagas: [],
  items: [],
  locations: [],
  movies: [],
  episodes: [],
  manga: [],
  databooks: [],
  games: [],
});

test("category illustrations retain their exact entity and never borrow the first character", () => {
  const result = wikiPortalArtwork({
    ...catalogue(),
    characters: [
      { id: 99, name: "Oolong", race: "Terrien", image: "/oolong.png" },
      { id: 1, name: "Son Goku", race: "Saiyan", image: "/goku.png" },
      { id: 3, name: "Piccolo", race: "Namek", image: "/piccolo.png" },
    ],
    transformations: [{ id: 1, name: "Super Saiyan", image: "/super-saiyan.png" }],
    items: [
      { id: 1, slug: "dragon-radar", name: "Dragon Radar", image: "/radar.png" },
      { id: 4, slug: "scouter", name: "Scouter", image: "/scouter.png" },
    ],
    sagas: [{ id: 12, name: "Saga", image: "/saga.png" }],
  });
  expect(result.characters?.entityId).toBe(1);
  expect(result.races).toMatchObject({ entityId: 3, alt: "Piccolo", image: "/piccolo.png" });
  expect(result.transformations?.image).toBe("/super-saiyan.png");
  expect(result["power-levels"]?.image).toBe("/scouter.png");
  expect(result.items?.image).toBe("/radar.png");
  expect(result.sagas?.image).toBe("/saga.png");
  expect(Object.values(result).some((entry) => entry?.image.includes("oolong"))).toBe(false);
});

test("missing or mismatched curated entities leave an honest missing illustration", () => {
  const result = wikiPortalArtwork({
    ...catalogue(),
    characters: [
      { id: 3, name: "Piccolo", race: "Saiyan", image: "/wrong.png" },
      { id: 99, name: "Other", image: "/other.png" },
    ],
    items: [{ id: 1, slug: "dragon-radar", image: "/radar.png" }],
    transformations: [{ id: 4, name: "Other form", image: "/other-form.png" }],
  });
  expect(result.characters).toBeUndefined();
  expect(result.races).toBeUndefined();
  expect(result.transformations).toBeUndefined();
  expect(result["power-levels"]).toBeUndefined();
});

test("event and card art comes from their own public catalogue records", () => {
  const result = wikiPortalArtwork({
    ...catalogue(),
    battles: [{ id: 8, title: "Battle", image: "/battle.png" }],
    card: { id: "card-32", title: "Card32", image: "/card32.jpg" },
  });
  expect(result.events).toMatchObject({ entityId: 8, image: "/battle.png" });
  expect(result.cards).toMatchObject({ entityId: "card-32", image: "/card32.jpg" });
});

test("the three mascots retain distinct curated identities and an SSR-selected focus", () => {
  const mascots = wikiPortalMascots(
    [
      { id: 99, name: "Oolong", image: "/oolong.png" },
      { id: 90, name: "Kid Buu", image: "./dbz/transformations/majin-buu-pure.webp" },
      { id: 1, name: "Goku", image: "/goku.png" },
    ],
    [{ id: 1, slug: "shenron", name: "Shenron", image: "/shenron.png" }],
  );
  expect(mascots.map((entry) => entry.key)).toEqual(["goku", "kid-buu", "shenron"]);
  expect(mascots[1]?.image).toBe("/dbz/transformations/majin-buu-pure.webp");
  expect(portalFeaturedKey(mascots, 0)).toBe("goku");
  expect(portalFeaturedKey(mascots, 1)).toBe("kid-buu");
  expect(portalFeaturedKey(mascots, 2)).toBe("shenron");
  expect(portalFeaturedKey(mascots, 3)).toBe("goku");
  expect(wikiPortalMascots([], [])).toEqual([]);
  expect(portalArtworkUrl("https://example.org/dbz/original.png")).toBe(
    "https://example.org/dbz/original.png",
  );
});

test("catalogue releases exclude future, undated and unillustrated records", () => {
  const entries = recentPortalPublications(
    [
      { id: "future", title: "Future", href: "/future", date: 101, image: "/future.png" },
      { id: "old", title: "Old", href: "/old", date: 20, image: "/old.png" },
      { id: "latest", title: "Latest", href: "/latest", date: 90, image: "/latest.png" },
      { id: "missing", title: "Missing", href: "/missing", date: 99 },
    ],
    100,
  );
  expect(entries.map((entry) => entry.id)).toEqual(["latest", "old"]);
});
