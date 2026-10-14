import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DragonBallWordmark } from "../src/toriyama/DragonBallWordmark";
import { renderDragonBallWordmark } from "../src/toriyama-svg/wordmark";
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
  expect(html).toContain("Dragon Ball France");
  expect(html).not.toContain("<image");
});

test("decorative marks do not add a second link announcement", () => {
  const html = renderToStaticMarkup(<DragonBallWordmark decorative />);
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain("<title");
  expect(html).not.toContain("aria-labelledby");
});
