import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DragonBallWordmark } from "../src/toriyama/DragonBallWordmark";
import {
  renderDragonBallWordmark,
  WORDMARK_LETTERS,
  WORDMARK_GRADIENTS,
} from "../src/toriyama-svg/wordmark";
import { KINTO_UN_ILLUSTRATION } from "../src/toriyama-svg/kinto-un";

test("the vector asset is reproducible and contains no font or raster dependency", async () => {
  const svg = renderDragonBallWordmark();
  expect(
    await Bun.file(new URL("../assets/brand/dragon-ball-wordmark.svg", import.meta.url)).text(),
  ).toBe(svg);
  expect(svg).not.toMatch(/<image|<text|data:image|Beerus|Super|<circle|<polygon/i);
  expect(svg).toContain('<title id="title">Dragon Ball France</title>');
});

test("cloud geometry stays owned by the canonical Kinto-Un module", () => {
  const svg = renderDragonBallWordmark();
  for (const d of [
    KINTO_UN_ILLUSTRATION.silhouette,
    KINTO_UN_ILLUSTRATION.lumiere,
    ...KINTO_UN_ILLUSTRATION.volutes,
  ]) {
    expect(svg).toContain(`d="${d}"`);
  }
  expect(svg).toContain('clip-path="url(#dragon-wordmark-cloud-clip)"');
});

test("multiple inline marks have independent accessible titles", () => {
  const html = renderToStaticMarkup(
    <>
      <DragonBallWordmark title="Dragon Ball France" />
      <DragonBallWordmark />
    </>,
  );
  const ids = [...html.matchAll(/<title id="([^"]+)"/g)].map((match) => match[1]);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  const clipIds = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
  expect(clipIds).toHaveLength(2);
  expect(new Set(clipIds).size).toBe(2);
  for (const clipId of clipIds) expect(html).toContain(`url(#${clipId})`);
  const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(allIds).size).toBe(allIds.length);
  const paintIds = [...html.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
  for (const paintId of paintIds) expect(allIds).toContain(paintId);
  expect(html).toContain("Dragon Ball France");
  expect(html).not.toContain("<image");
});

test("HD letter shapes retain closed contours and curved outlines without retyping glyphs", () => {
  expect(WORDMARK_LETTERS.length).toBe(15);
  const svg = renderDragonBallWordmark();
  for (const { d } of WORDMARK_LETTERS) {
    expect(d).toMatch(/^M.+Z$/);
    expect(d).toContain("Q");
    expect(svg).toContain(d);
  }
});

test("measured gradients preserve yellow-to-gold and saturated-to-dark-red progression", () => {
  expect(WORDMARK_GRADIENTS.yellow[2].color).toBe("#fef100");
  expect(WORDMARK_GRADIENTS.yellow.at(-1)!.color).toBe("#bc8800");
  expect(WORDMARK_GRADIENTS.red[0].color).toBe("#e70113");
  expect(WORDMARK_GRADIENTS.red.at(-1)!.color).toBe("#940d15");
  for (const stops of Object.values(WORDMARK_GRADIENTS)) {
    for (let index = 1; index < stops.length; index++)
      expect(stops[index].y).toBeGreaterThan(stops[index - 1].y);
  }
});

test("decorative marks do not add a second link announcement", () => {
  const html = renderToStaticMarkup(<DragonBallWordmark decorative />);
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain("<title");
  expect(html).not.toContain("aria-labelledby");
});
