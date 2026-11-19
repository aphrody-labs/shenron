import { expect, test } from "bun:test";
import { canonicalCharacterSitemapRows, slugSitemapPaths } from "../src/lib/wiki-sitemap";

test("character sitemap keeps canonical rows and excludes duplicate redirect IDs", () => {
  const rows = canonicalCharacterSitemapRows([
    { id: 123, name: "C-21" },
    { id: 298, name: "C-21" },
    { id: 706, name: "Krilin" },
    { id: 11, name: "Krilin" },
  ]);

  expect(rows.map(({ id }) => id)).toEqual([298, 11]);
});

test("character sitemap emits a duplicate slug only once", () => {
  const rows = canonicalCharacterSitemapRows([
    { id: 5000, name: "Shared Name" },
    { id: 5001, name: "Shared Name" },
  ]);

  expect(rows.map(({ id }) => id)).toEqual([5000]);
});

test("slugSitemapPaths drops empty and non-string slugs", () => {
  const rows = [{ slug: "namek" }, { slug: "" }, { slug: "  " }, { slug: null }, { slug: 7 }];
  expect(slugSitemapPaths("/wiki/locations", rows)).toEqual([
    ["/wiki/locations/namek", 0.5, undefined],
  ]);
});

test("slugSitemapPaths emits a duplicate slug once, in input order", () => {
  const rows = [{ slug: "b" }, { slug: "a" }, { slug: "b" }];
  expect(slugSitemapPaths("/wiki/items", rows).map(([path]) => path)).toEqual([
    "/wiki/items/b",
    "/wiki/items/a",
  ]);
});

test("slugSitemapPaths normalises trailing slashes on the prefix", () => {
  expect(slugSitemapPaths("/wiki/items/", [{ slug: "dragon-radar" }])).toEqual([
    ["/wiki/items/dragon-radar", 0.5, undefined],
  ]);
  expect(slugSitemapPaths("/wiki/items", [])).toEqual([]);
});
