import { expect, test } from "bun:test";
import {
  NON_INDEXABLE_PATHS,
  contentDate,
  contentDateFromSeconds,
  isIndexablePath,
} from "../src/lib/sitemap-entries";

test("search and random are excluded from the sitemap", () => {
  expect([...NON_INDEXABLE_PATHS].sort()).toEqual(["/wiki/random", "/wiki/search"]);
  expect(isIndexablePath("/wiki/search")).toBe(false);
  expect(isIndexablePath("/wiki/random")).toBe(false);
  expect(isIndexablePath("/wiki/episodes")).toBe(true);
  expect(isIndexablePath("/wiki/search/extra")).toBe(true);
});

test("contentDate omits lastmod when the source has no real date", () => {
  expect(contentDate(null)).toBeUndefined();
  expect(contentDate(undefined)).toBeUndefined();
  expect(contentDate(0)).toBeUndefined();
  expect(contentDate("")).toBeUndefined();
  expect(contentDate("not a date")).toBeUndefined();
  expect(contentDate(new Date(Number.NaN))).toBeUndefined();
});

test("contentDate keeps real dates", () => {
  const d = new Date("2024-05-06T07:08:09.000Z");
  expect(contentDate(d)).toBe(d);
  expect(contentDate("2024-05-06T07:08:09.000Z")?.toISOString()).toBe(d.toISOString());
  expect(contentDate(d.getTime())?.toISOString()).toBe(d.toISOString());
});

test("contentDateFromSeconds converts unix seconds and drops empty values", () => {
  expect(contentDateFromSeconds(1_700_000_000)?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  expect(contentDateFromSeconds(0)).toBeUndefined();
  expect(contentDateFromSeconds(null)).toBeUndefined();
});
