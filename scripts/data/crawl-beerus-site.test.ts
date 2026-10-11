// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { approvedUrl } from "./crawl-beerus-site";
test("source traversal stays on public approved hosts and the requested English subtree", () => {
  expect(approvedUrl("music/index.html#theme", "https://dragonball-super.com/en/", true)).toBe(
    "https://dragonball-super.com/en/music/index.html",
  );
  expect(
    approvedUrl(
      "https://dragonball-super.com.evil.test/en/",
      "https://dragonball-super.com/en/",
      true,
    ),
  ).toBeUndefined();
  expect(
    approvedUrl(
      "https://credential@dragonball-super.com/en/",
      "https://dragonball-super.com/en/",
      true,
    ),
  ).toBeUndefined();
  expect(approvedUrl("/admin/", "https://dragonball-super.com/en/", true)).toBeUndefined();
  expect(
    approvedUrl("https://127.0.0.1/a", "https://dragonball-super.com/en/", false),
  ).toBeUndefined();
});
