/**
 * Public heroes use the quality selector; the episode catalogue starts with records.
 */
import { describe, expect, test } from "bun:test";
import { PAGE_HERO_KEYS } from "../src/lib/page-banners";

const routes: Record<(typeof PAGE_HERO_KEYS)[number], string> = {
  episodes: "../src/app/wiki/episodes/page.tsx",
  films: "../src/app/wiki/movies/page.tsx",
  chronologie: "../src/app/wiki/timeline/page.tsx",
  personnages: "../src/app/wiki/characters/page.tsx",
  sagas: "../src/app/wiki/sagas/page.tsx",
  arcs: "../src/app/wiki/arcs/page.tsx",
  races: "../src/app/wiki/races/page.tsx",
  transformations: "../src/app/wiki/transformations/page.tsx",
  techniques: "../src/app/wiki/techniques/page.tsx",
  jeux: "../src/app/wiki/games/page.tsx",
  manga: "../src/app/wiki/manga/page.tsx",
  databooks: "../src/app/wiki/databooks/page.tsx",
  combats: "../src/app/wiki/events/page.tsx",
  dragons: "../src/app/wiki/dragons/page.tsx",
  lieux: "../src/app/wiki/locations/page.tsx",
  musiques: "../src/app/wiki/music/page.tsx",
  objets: "../src/app/wiki/items/page.tsx",
  puissances: "../src/app/wiki/power-levels/page.tsx",
  news: "../src/app/news/page.tsx",
  tools: "../src/app/wiki/tools/page.tsx",
  staff: "../src/app/wiki/staff/page.tsx",
};

describe("bannières configurées dans l'administration", () => {
  test("public pages use qualified frames while episodes start directly with the catalogue", async () => {
    for (const key of PAGE_HERO_KEYS) {
      const source = await Bun.file(new URL(routes[key], import.meta.url)).text();
      if (key === "episodes") {
        expect(source).toContain("@/components/episodes/EpisodesCatalogue");
        expect(source).not.toContain("<Billboard");
        continue;
      }
      expect(source).toContain('from "@/lib/banner-config"');
      expect(source).toContain(`pageHero("${key}")`);
    }
  });

  test("les aperçus série utilisent aussi la configuration PostgreSQL", async () => {
    const routes = [
      "../src/app/wiki/episodes/series/[series]/page.tsx",
      "../src/app/wiki/episodes/@modal/(.)[id]/page.tsx",
      "../src/app/wiki/movies/@modal/(.)[slug]/page.tsx",
    ];
    for (const route of routes) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain('from "@/lib/banner-config"');
      expect(source).toContain("await bannerForSeries(");
    }
  });

  test("une image éditoriale ne masque jamais une bannière explicitement configurée", async () => {
    const manga = await Bun.file(new URL("../src/app/wiki/manga/page.tsx", import.meta.url)).text();
    expect(manga).toContain('const heroImage = await pageHero("manga")');
    expect(manga).not.toContain("heroCover ?");

    for (const route of [
      "../src/app/wiki/episodes/series/[series]/page.tsx",
      "../src/app/wiki/episodes/@modal/(.)[id]/page.tsx",
    ]) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain("backdrop={await bannerForSeries(");
      expect(source).not.toContain(".image ? assetUrl");
    }
  });
});
