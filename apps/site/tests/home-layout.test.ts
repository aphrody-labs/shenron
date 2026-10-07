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
    const backdrop = source("../../../packages/ui/src/public/SceneBackdrop.tsx");
    expect(backdrop).toContain("prefers-reduced-motion");
    expect(backdrop).toContain('preload={shouldPlay ? "auto" : "none"}');
    const scene = source("../src/components/home/SectionScene.tsx");
    expect(scene).toContain("IntersectionObserver");
    expect(scene).toMatch(/near \? <SceneBackdrop/);
    const heroScenes = source("../src/components/home/HomeHeroScenes.tsx");
    expect(heroScenes).toContain("useScenePlaybackPolicy");
  });

  test("the page keeps its ISR window", () => {
    expect(source("../src/app/page.tsx")).toMatch(/export const revalidate = \d+/);
  });
});

describe("no placeholder data on the home", () => {
  test("an entry needs three votes, a board without podium is hidden", async () => {
    const { homeCommunityTops } = await import("../src/components/home/HomeView");
    const entry = (id: string, count: number) => ({ id, count, rank: 1, average: 5 });
    const board = (id: string, counts: number[]) => ({
      def: { id },
      entries: counts.map((c, i) => entry(`${id}-${i}`, c)),
      totalVotes: counts.reduce((n, c) => n + c, 0),
      ratedCount: counts.length,
    });
    const payload = (boards: unknown[]) => ({ boards, globalVotes: 0, generatedAt: "" }) as never;
    expect(homeCommunityTops(null)).toBeNull();
    expect(homeCommunityTops(payload([board("a", [1, 2]), board("b", [])]))).toBeNull();
    const kept = homeCommunityTops(payload([board("a", [1, 2]), board("b", [1, 4, 3])]));
    expect(kept?.boards.map((b) => String(b.def.id))).toEqual(["b"]);
    expect(kept?.boards[0]?.entries.map((e) => `${e.id}#${e.rank}`)).toEqual(["b-1#1", "b-2#2"]);
  });

  test("the home loads its own best-of, /rankings keeps every vote", () => {
    expect(source("../src/app/page.tsx")).toContain("getHomeCommunityTops()");
    expect(source("../src/lib/community-tops-data.ts")).toContain(
      "loadCommunityTops(HOME_TOPS_MIN_ENTRY_VOTES)",
    );
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
