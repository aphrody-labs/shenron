// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { uiAssetPaths } from "../src/assets";

test("the DRAGONBALL.FR logo ships as a layered vector with lossless renders", async () => {
  const svg = await Bun.file(
    new URL("../assets/brand/dragonballfr-logo.svg", import.meta.url),
  ).text();
  expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2006 509"');
  expect(svg.match(/<path /g)?.length).toBe(5);
  expect(svg).not.toContain("<image");
  for (const width of [512, 1024, 2048]) {
    const path = `brand/dragonballfr-logo-${width}.png`;
    expect(uiAssetPaths as readonly string[]).toContain(path);
    const bytes = new Uint8Array(
      await Bun.file(new URL(`../assets/${path}`, import.meta.url)).arrayBuffer(),
    );
    expect([...bytes.subarray(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
    expect(new DataView(bytes.buffer).getUint32(16)).toBe(width);
  }
});
