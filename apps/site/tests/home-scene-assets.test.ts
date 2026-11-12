import { expect, test } from "bun:test";
import { homeSceneAssetUrl, homeSceneVideoUrl } from "../src/components/home/SceneBackdrop";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";

test("owned homepage clips and posters use the asset service instead of the wiki page router", () => {
  expect(homeSceneAssetUrl("/wiki/kidbuu.web.mp4")).toBe(
    `${DEFAULT_PUBLIC_ORIGINS.cdn}/assets/wiki/kidbuu.web.mp4`,
  );
  expect(homeSceneAssetUrl("/wiki/kidbuu.poster.webp?v=3")).toBe(
    `${DEFAULT_PUBLIC_ORIGINS.cdn}/assets/wiki/kidbuu.poster.webp?v=3`,
  );
});

test("the qualified owned compressed sibling is selected once and keeps query parameters", () => {
  const expected = `${DEFAULT_PUBLIC_ORIGINS.cdn}/assets/wiki/kidbuu.web.mp4?v=3#frame`;
  expect(homeSceneVideoUrl("/wiki/kidbuu.mp4?v=3#frame")).toBe(expected);
  expect(homeSceneVideoUrl("/wiki/kidbuu.web.mp4?v=3#frame")).toBe(expected);
  expect(homeSceneVideoUrl("https://google.com/approved/clip.mp4")).toBe(
    "https://google.com/approved/clip.mp4",
  );
});

test("custom external scenes and other local application assets preserve their source", () => {
  const foreign = "https://google.com/approved/clip.mp4?v=3";
  expect(homeSceneAssetUrl(foreign)).toBe(foreign);
  expect(homeSceneAssetUrl("/brand/home-beerus-goku.webp")).toBe("/brand/home-beerus-goku.webp");
});
