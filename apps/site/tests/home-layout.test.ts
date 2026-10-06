/**
 * The home keeps the restored identity (cover wordmark, flying Kinto-Un, hero clips, a clip
 * per block, loaded lazily) and ends on the latest news, then the mini-games.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = (relative: string) => readFileSync(path.join(import.meta.dir, relative), "utf8");

describe("home layout", () => {
  const view = source("../src/components/home/HomeView.tsx");

  test("news then mini-games close the page", () => {
    const journey = view.indexOf("<HomeMenuJourney");
    const news = view.indexOf('id="actualites"');
    const games = view.indexOf("<HomeGames");
    const blocks = view.indexOf("{blocks}");
    expect(blocks).toBeGreaterThan(0);
    expect(journey).toBeGreaterThan(blocks);
    expect(news).toBeGreaterThan(journey);
    expect(games).toBeGreaterThan(news);
    expect(view.indexOf("<HomeGames", games + 1)).toBe(-1);
  });

  test("hero: wordmark, Kinto-Un and clips; blocks over their own clip", () => {
    const hero = source("../src/components/home/HomeHero.tsx");
    expect(hero).toContain("home-wordmark");
    expect(hero).toContain("<KintoUnVolant");
    expect(hero).toContain("<HomeHeroScenes");
    expect(view).toContain("<SectionScene");
  });

  test("clips stay lazy and respect reduced motion", () => {
    const backdrop = source("../src/components/home/SceneBackdrop.tsx");
    expect(backdrop).toContain("prefers-reduced-motion");
    expect(backdrop).toContain('preload={active ? "auto" : "none"}');
    const scene = source("../src/components/home/SectionScene.tsx");
    expect(scene).toContain("IntersectionObserver");
    expect(scene).toMatch(/near \? <SceneBackdrop/);
    const heroScenes = source("../src/components/home/HomeHeroScenes.tsx");
    expect(heroScenes).toContain("prefers-reduced-motion");
  });

  test("the page keeps its ISR window", () => {
    expect(source("../src/app/page.tsx")).toMatch(/export const revalidate = \d+/);
  });
});
