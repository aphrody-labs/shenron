// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { planMediaPageCounts } from "./media-page-counts";

const entry = { sha256: "a".repeat(64), size: 10, contentType: "image/jpeg" };
const pages = ["./assets/manga/DBFC/ch1/001.jpg", "./assets/manga/DBFC/ch1/002.jpg"];
const assets = Object.fromEntries(pages.map((path) => [path.slice(1), entry]));
const volume = { id: 45, pageCount: null, chapters: [{ id: 6, pages }] };
test("derived counts require every referenced image and retain null-only preconditions", () => {
  expect(planMediaPageCounts([volume], assets)[0]).toMatchObject({
    id: 45,
    pageCount: 2,
    expected: { pageCount: null },
  });
  expect(planMediaPageCounts([{ ...volume, pageCount: 200 }], assets)).toEqual([]);
  expect(() => planMediaPageCounts([volume], {})).toThrow("missing");
  expect(() =>
    planMediaPageCounts([volume], { ...assets, [pages[0]!.slice(1)]: { ...entry, size: 0 } }),
  ).toThrow("missing");
});
test("duplicate, traversal and mismatched references cannot manufacture page counts", () => {
  expect(() =>
    planMediaPageCounts(
      [{ ...volume, chapters: [{ id: 6, pages: [pages[0]!, pages[0]!] }] }],
      assets,
    ),
  ).toThrow("duplicate");
  expect(() =>
    planMediaPageCounts(
      [{ ...volume, chapters: [{ id: 6, pages: ["./assets/manga/../private.jpg"] }] }],
      assets,
    ),
  ).toThrow("Unexpected");
  expect(() => planMediaPageCounts([volume, volume], assets)).toThrow("volume inventory");
  expect(volume.pageCount).toBeNull();
});
