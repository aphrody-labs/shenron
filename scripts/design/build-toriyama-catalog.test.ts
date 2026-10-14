import { expect, test } from "bun:test";
import { toriyamaCatalog } from "./build-toriyama-catalog";

test("the catalogue is reproducible and covers source components and packaged artwork", async () => {
  const catalog = await toriyamaCatalog();
  const artifact = await Bun.file(
    `${import.meta.dir}/../../packages/ui/src/toriyama/catalog.json`,
  ).json();
  expect(catalog).toEqual(artifact);
  expect(new Set(catalog.components.map((item) => item.name)).size).toBe(catalog.components.length);
  expect(catalog.components.some((item) => item.name === "DragonBallWordmark")).toBe(true);
  expect(catalog.components.some((item) => item.name === "KintoUn")).toBe(true);
  expect(catalog.artwork.some((item) => item.path === "brand/dragon-ball-wordmark.svg")).toBe(true);
});
