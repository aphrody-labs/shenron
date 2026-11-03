/**
 * Public heroes use the quality selector; streaming and the techniques catalogue own their
 * composition.
 */
import { describe, expect, test } from "bun:test";
import { PAGE_HERO_KEYS } from "../src/lib/page-banners";

const routes: Record<(typeof PAGE_HERO_KEYS)[number], string> = {
  episodes: "../src/app/wiki/episodes/(index)/page.tsx",
  films: "../src/app/wiki/movies/(index)/page.tsx",
  chronologie: "../src/app/wiki/timeline/page.tsx",
  personnages: "../src/app/wiki/characters/(index)/page.tsx",
  sagas: "../src/app/wiki/sagas/(index)/page.tsx",
  arcs: "../src/app/wiki/arcs/page.tsx",
  races: "../src/app/wiki/races/(index)/page.tsx",
  transformations: "../src/app/wiki/transformations/(index)/page.tsx",
  techniques: "../src/app/wiki/techniques/(index)/page.tsx",
  jeux: "../src/app/wiki/games/(index)/page.tsx",
  manga: "../src/app/wiki/manga/page.tsx",
  databooks: "../src/app/wiki/databooks/(index)/page.tsx",
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
  test("public pages use qualified frames while streaming owns its catalogue composition", async () => {
    for (const key of PAGE_HERO_KEYS) {
      const source = await Bun.file(new URL(routes[key], import.meta.url)).text();
      if (key === "episodes") {
        expect(source).toContain("@/components/streaming/StreamingCatalogue");
        expect(source).not.toContain("<Billboard");
        continue;
      }
      if (key === "techniques") {
        // Since 740f7ffe the catalogue lives in the compact wiki shell with its own heading.
        expect(source).toContain("@/components/wiki/WikiPageShell");
        expect(source).toContain("<TechniqueCatalogueHeading");
        expect(source).not.toContain("<PageHero");
        continue;
      }
      if (["races", "objets", "lieux", "dragons", "transformations"].includes(key)) {
        // These catalogues now illustrate their own records rather than a generic frame.
        expect(source).toContain("image={artwork?.image ?? undefined}");
        expect(source).toContain("imageAlt={artwork?.name}");
        continue;
      }
      expect(source).toContain('from "@/lib/banner-config"');
      expect(source).toContain(`pageHero("${key === "combats" ? "sagas" : key}")`);
    }
  });

  test("les aperçus série utilisent aussi la configuration PostgreSQL", async () => {
    const seriesRoutes = [
      "../src/app/wiki/episodes/series/[series]/page.tsx",
      "../src/app/wiki/episodes/@modal/(.)[id]/page.tsx",
      "../src/app/wiki/movies/@modal/(.)[slug]/page.tsx",
    ];
    for (const route of seriesRoutes) {
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
