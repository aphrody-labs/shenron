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

describe("no placeholder data on the home", () => {
  test("a Top 3 board needs real votes, none left hides the block", async () => {
    const { homeCommunityTops, HOME_TOPS_MIN_VOTES } =
      await import("../src/components/home/HomeView");
    const board = (totalVotes: number, entries: number) => ({
      def: { id: `b${totalVotes}` },
      entries: Array.from({ length: entries }, (_, i) => ({ rank: i + 1 })),
      totalVotes,
      ratedCount: entries,
    });
    const payload = (boards: unknown[]) => ({ boards, globalVotes: 0, generatedAt: "" }) as never;
    expect(homeCommunityTops(null)).toBeNull();
    expect(homeCommunityTops(payload([board(1, 1), board(0, 0)]))).toBeNull();
    const kept = homeCommunityTops(payload([board(1, 1), board(HOME_TOPS_MIN_VOTES, 3)]));
    expect(kept?.boards.map((b) => b.totalVotes)).toEqual([HOME_TOPS_MIN_VOTES]);
  });

  test("magazine issues never reach the home databook rail", () => {
    const catalog = source("../src/lib/media-catalog.ts");
    expect(catalog).toContain("notInArray(botDatabooks.category, [...MAGAZINE_CATEGORIES])");
    for (const magazine of ["V-Jump", "Weekly Shonen Jump", "Saikyō Jump"])
      expect(catalog).toContain(`"${magazine}"`);
  });

  test("no hard-coded loading banner", async () => {
    expect(source("../src/app/loading.tsx")).not.toMatch(/CHARGEMENT|Chargement/);
    const glob = new Bun.Glob("src/**/*.tsx");
    const offenders: string[] = [];
    for await (const file of glob.scan(path.join(import.meta.dir, ".."))) {
      const code = await Bun.file(path.join(import.meta.dir, "..", file)).text();
      if (/>\s*(CHARGEMENT|Chargement)…|"(CHARGEMENT|Chargement)(…|\.\.\.)"/.test(code))
        offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
