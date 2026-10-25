// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { filterWikiBranches, wikiSearchMatches } from "../src/lib/wiki-manager-explorer";
const categories = [
  {
    id: "parent",
    name: "Encyclopédie",
    slug: "encyclopedia",
    pages: [{ title: "Editorial", slug: "editorial" }],
    children: [
      {
        id: "child",
        name: "Saiyans",
        slug: "saiyans",
        pages: [
          { title: "Vegeta", slug: "vegeta" },
          { title: "Goku", slug: "goku" },
        ],
      },
    ],
  },
];

test("matching parent or child keeps navigable descendants intact", () => {
  expect(filterWikiBranches(categories, "encyclopedie")).toEqual(categories);
  expect(filterWikiBranches(categories, "saiyan")[0]?.children[0]?.pages).toHaveLength(2);
});
test("matching a leaf removes unrelated siblings without mutating the source", () => {
  const result = filterWikiBranches(categories, "VEGETA");
  expect(result[0]?.pages).toEqual([]);
  expect(result[0]?.children[0]?.pages).toEqual([{ title: "Vegeta", slug: "vegeta" }]);
  expect(categories[0]!.children[0]!.pages).toHaveLength(2);
  expect(filterWikiBranches(categories, "unmatched")).toEqual([]);
  expect(wikiSearchMatches(" éPISODE ", "Épisode")).toBe(true);
});
