// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { recentPortalPublications, type PortalPublication } from "../src/lib/wiki-publications";

const published = (id: string, date: number): PortalPublication => ({
  id,
  date,
  title: `Published volume ${id}`,
  href: `/wiki/manga/volume/${id}`,
  image: `/covers/${id}.png`,
});

test("release selection excludes future, undated and empty catalogue entries", () => {
  const real = published("10", 900);
  expect(
    recentPortalPublications(
      [
        real,
        published("future", 1100),
        published("undated", 0),
        published("invalid", NaN),
        { ...published("no-title", 950), title: "  " },
        { ...published("no-image", 980), image: " " },
        { ...published("foreign", 990), href: "https://foreign.example/volume" },
      ],
      1000,
    ),
  ).toEqual([real]);
  expect(recentPortalPublications([real], Infinity)).toEqual([]);
});

test("the newest three releases have stable tie ordering without changing source data", () => {
  const input = [
    published("z", 400),
    published("a", 400),
    published("old", 100),
    published("new", 500),
  ];
  const ids = input.map((item) => item.id);
  expect(recentPortalPublications(input, 600).map((item) => item.id)).toEqual(["new", "a", "z"]);
  expect(input.map((item) => item.id)).toEqual(ids);
});
