// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { approvedUrl, isPlaybackMedia } from "./crawl-beerus-site";
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
test("official update identity survives normalization without tracking parameters", () => {
  expect(
    approvedUrl(
      "detail.html?id=20261008-01&utm_source=share",
      "https://dragonball-super.com/en/updates/",
      true,
    ),
  ).toBe("https://dragonball-super.com/en/updates/detail.html?id=20261008-01");
  expect(
    approvedUrl("detail.html?id=20260903-2", "https://dragonball-super.com/en/updates/", true),
  ).toBe("https://dragonball-super.com/en/updates/detail.html?id=20260903-2");
});
test("private site capture excludes playback manifests and segments", () => {
  for (const extension of ["m3u8", "mpd", "ts", "m4s", "mp4", "webm", "aac", "key"]) {
    expect(isPlaybackMedia(`https://dragonball-super.com/media.${extension}?v=1`)).toBe(true);
  }
  expect(isPlaybackMedia("https://dragonball-super.com/en/assets/css/style.css")).toBe(false);
});
