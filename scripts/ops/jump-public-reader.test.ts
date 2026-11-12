// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { jumpPublicReaderUrls } from "./jump-public-reader";

const source = "https://shonenjumpplus.com/episode/10833497643049550354";
const image = "https://cdn-ak-img.shonenjumpplus.com/public/page/2/verified-source-id";
const next = "https://shonenjumpplus.com/episode/13932016480028878408";
function html(overrides = {}) {
  const value = {
    readableProduct: {
      permalink: source,
      isPublic: true,
      nextReadableProductUri: next,
      pageStructure: {
        pages: [
          { type: "main", src: image },
          { type: "main", src: image },
          { type: "other", src: "https://google.com/ad" },
        ],
      },
      ...overrides,
    },
  };
  return `<script id='episode-json' data-value='${JSON.stringify(value).replaceAll('"', "&quot;")}'></script>`;
}
test("public reader discovers exact public image references and the next episode once", async () => {
  expect(await jumpPublicReaderUrls(html(), source)).toEqual([image, next]);
});
test("nonpublic episodes stop traversal even if page references remain in the response", async () => {
  expect(await jumpPublicReaderUrls(html({ isPublic: false }), source)).toEqual([]);
  expect(await jumpPublicReaderUrls(html({ isPublic: undefined }), source)).toEqual([]);
});
test("last public episode stops pagination and rejects injected providers or protected paths", async () => {
  expect(await jumpPublicReaderUrls(html({ nextReadableProductUri: null }), source)).toEqual([
    image,
  ]);
  expect(await jumpPublicReaderUrls(html({ permalink: next }), source)).toEqual([]);
  expect(await jumpPublicReaderUrls(html(), "https://google.com/episode/1")).toEqual([]);
  expect(
    await jumpPublicReaderUrls("<script id='episode-json' data-value='bad'></script>", source),
  ).toEqual([]);
  expect(
    await jumpPublicReaderUrls(
      html({
        pageStructure: {
          pages: [
            { type: "main", src: "https://cdn-ak-img.shonenjumpplus.com/private/page/1" },
            { type: "main", src: image + "?token=credential" },
            { type: "main", src: "https://google.com/public/page/1" },
          ],
        },
        nextReadableProductUri: "https://google.com/episode/1",
      }),
      source,
    ),
  ).toEqual([]);
});
