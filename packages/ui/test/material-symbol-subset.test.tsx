import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MaterialSymbol } from "../src/icones/MaterialSymbol";
import subset from "../src/icones/material-symbol-subset.json";
import { toriyamaCatalog } from "../../../scripts/design/build-toriyama-catalog";

test("the minimized owner subset is safe SVG and needs no icon font", () => {
  expect(Object.keys(subset.icons).length).toBeLessThanOrEqual(16);
  for (const name of Object.keys(subset.icons) as (keyof typeof subset.icons)[]) {
    const html = renderToStaticMarkup(<MaterialSymbol name={name} size={24} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<path");
    expect(html).not.toMatch(/<script|<image|<foreignObject|onclick|https?:/);
  }
});

test("the catalogue is reproducible and covers source components and packaged artwork", async () => {
  const catalog = await toriyamaCatalog();
  const artifact = await Bun.file(`${import.meta.dir}/../src/toriyama/catalog.json`).json();
  expect(catalog).toEqual(artifact);
  expect(new Set(catalog.components.map((item) => item.name)).size).toBe(catalog.components.length);
  expect(catalog.components.some((item) => item.name === "DragonBallWordmark")).toBe(true);
  expect(catalog.components.some((item) => item.name === "KintoUn")).toBe(true);
  expect(catalog.artwork.some((item) => item.path === "brand/dragon-ball-wordmark.svg")).toBe(true);
});
