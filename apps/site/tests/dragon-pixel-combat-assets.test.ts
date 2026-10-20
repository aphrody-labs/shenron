// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { parseSpriteAtlas } from "@aphrody/shenron-engine/sprite-atlas";
import { uiAssetPaths } from "../../../packages/ui/src/assets";

test("combat atlas publishes the reviewed chapter 516 derivative and its exact PNG digest", async () => {
  const path = "assets/manga/dragon-pixel/chapter-516/";
  const root = new URL("../../../packages/ui/assets/", import.meta.url);
  const manifest = parseSpriteAtlas(
    await Bun.file(new URL(path + "sheet.layout.json", root)).json(),
  );
  const png = await Bun.file(new URL(path + "sheet.png", root)).bytes();
  const digest = new Bun.CryptoHasher("sha256").update(png).digest("hex");
  expect(digest).toBe("6af0dff61aecefac2cd5432ff44b341282981b9eaf7805a461906bb9dbbd7039");
  expect(manifest.imageSha256).toBe(digest);
  expect(manifest.size).toEqual([784, 520]);
  expect(manifest.frames).toHaveLength(5);
  expect(manifest.fps).toBe(2);
  for (const name of ["sheet.png", "sheet.layout.json", "provenance.json"])
    expect(uiAssetPaths as readonly string[]).toContain(path + name);
  const provenance = await Bun.file(new URL(path + "provenance.json", root)).json();
  expect(provenance.source).toEqual({ work: "Dragon Ball Full Color", chapter: 516, page: 1 });
  expect(provenance.atlas.imageSha256).toBe(digest);
});
