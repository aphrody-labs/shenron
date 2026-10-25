import { expect, test } from "bun:test";
import { canonicalCharacterSitemapRows } from "../src/lib/wiki-sitemap";

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
