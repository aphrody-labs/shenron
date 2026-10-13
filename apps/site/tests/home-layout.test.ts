/**
 * The home keeps the restored identity (cover wordmark, flying Kinto-Un, hero clips, a clip
 * per block, loaded lazily) and ends on the latest news, then the mini-games.
 */
import { describe, expect, test } from "bun:test";
import { createElement, type ComponentProps, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { DEFAULT_HOME_CONFIG } from "../src/lib/home-scenes";
import { DEFAULT_CANON_CONFIG } from "../src/lib/canon-engine";
import { existsSync, readFileSync } from "node:fs";
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
    expect(hero).not.toContain("<HomeHeroScenes");
    expect(hero).toContain("heroFrame");
    expect(view).not.toContain("<SectionScene");
    expect(view).not.toContain("<SceneBackdrop");
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
  test("restored sections render real content while empty custom and community panels remain hidden", async () => {
    const { HomeView, coveredDestinations } = await import("../src/components/home/HomeView");
    const config = structuredClone(DEFAULT_HOME_CONFIG);
    config.canon.enabled = false;
    config.sections = [
      ...config.sections.map((section) => ({ ...section, enabled: true })),
      { ...config.sections[0]!, id: "custom-empty", isCustom: true, enabled: true, body: " " },
      {
        ...config.sections[0]!,
        id: "custom-real",
        isCustom: true,
        enabled: true,
        body: "Contenu éditorial vérifié",
      },
    ];
    const html = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider as ComponentType<
          Omit<ComponentProps<typeof NextIntlClientProvider>, "children">
        >,
        { locale: "fr", messages: fr, timeZone: "UTC" },
        createElement(HomeView, {
          config,
          access: null,
          stats: {
            users: 0,
            totalXp: 0,
            totalZeni: 0,
            achievementsUnlocked: 0,
            shopItems: 0,
            inventoryItems: 0,
          },
          personas: [],
          topMembers: [],
          topMembersAvailable: false,
          presence: { total: 0, online: 0, members: [] },
          characters: [
            {
              id: 1,
              name: "Son Goku",
              nameJa: null,
              race: null,
              ki: null,
              image: "/wiki/goku.webp",
            },
          ],
          sagas: [],
          bestof: [],
          communityTops: null,
          feed: [],
          catalog: null,
          canon: { doctrine: DEFAULT_CANON_CONFIG, references: 0 },
        }),
      ),
    );
    expect(html).toContain('id="personnages"');
    expect(html).toContain("Son Goku");
    expect(html).toContain('id="custom-real"');
    for (const empty of ["custom-empty", "community", "pantheon", "sagas", "tops", "actualites"])
      expect(html).not.toContain(`id="${empty}"`);
    expect(html).toContain('id="jeux"');
    expect(html).not.toContain("official-beerus-logo");
    expect(html).not.toContain('class="home-hero__beerus"');
    expect(html).not.toContain('id="universe"');
    expect(html).not.toContain('id="beerus"');
    expect(html).not.toContain('href="#hero"');
    expect(html).not.toContain("dbsBeerus.openLocalEpisode");
    expect(html).toContain('href="/wiki/gifs"');
    expect(source("../src/components/home/HomeView.tsx")).not.toContain("ContinueRail");
    expect(source("../src/app/page.tsx")).not.toContain("getWikiCounts");
    const covered = coveredDestinations(config, new Set(["personnages"]));
    expect(covered.filter((href) => href === "/wiki/characters")).toHaveLength(1);
    expect(covered).toContain("/games");
  });

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
    const loading = path.join(import.meta.dir, "../src/app/loading.tsx");
    if (existsSync(loading))
      expect(readFileSync(loading, "utf8")).not.toMatch(/CHARGEMENT|Chargement/);
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
