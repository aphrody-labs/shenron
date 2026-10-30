// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { parseWikimediaFile, verifyWikimediaImages } = await import("../src/lib/wikimedia-images");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("parses commons and project thumbnails, ignores other hosts", () => {
  expect(
    parseWikimediaFile(
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/KAGEAVATAR.jpg/330px-KAGEAVATAR.jpg?utm_source=x",
    ),
  ).toEqual({ api: "https://commons.wikimedia.org", title: "KAGEAVATAR.jpg" });
  expect(
    parseWikimediaFile("https://upload.wikimedia.org/wikipedia/en/1/15/Akira_Toriyama_in_1982.jpg"),
  ).toEqual({ api: "https://en.wikipedia.org", title: "Akira_Toriyama_in_1982.jpg" });
  expect(
    parseWikimediaFile(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Mario_Casta%C3%B1eda_2018.jpg/330px-x.jpg",
    )?.title,
  ).toBe("Mario_Castañeda_2018.jpg");
  expect(parseWikimediaFile("https://dragonballfr.com/assets/x.jpg")).toBeNull();
  expect(parseWikimediaFile("not a url")).toBeNull();
});

test("existing files resolve to their thumbnail, missing ones to null", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      query: {
        normalized: [{ from: "File:Kept_File.jpg", to: "File:Kept File.jpg" }],
        pages: [
          {
            title: "File:Kept File.jpg",
            imageinfo: [{ thumburl: "https://upload.wikimedia.org/t.jpg" }],
          },
          { title: "File:Gone.jpg", missing: true },
        ],
      },
    })) as unknown as typeof fetch;
  const kept =
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/Kept_File.jpg/330px-Kept_File.jpg";
  const gone = "https://upload.wikimedia.org/wikipedia/commons/9/90/Gone.jpg";
  const other = "https://dragonballfr.com/assets/wiki/x.webp";
  const result = await verifyWikimediaImages([kept, gone, other, null]);
  expect(result.get(kept)).toBe("https://upload.wikimedia.org/t.jpg");
  expect(result.get(gone)).toBeNull();
  expect(result.get(other)).toBe(other);
});

test("an API outage keeps the original URLs", async () => {
  globalThis.fetch = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
  const url = "https://upload.wikimedia.org/wikipedia/commons/9/90/Daisuke_Nishio.jpg";
  expect((await verifyWikimediaImages([url])).get(url)).toBe(url);
});
