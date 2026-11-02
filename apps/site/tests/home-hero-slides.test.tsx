import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import { DEFAULT_HOME_CONFIG } from "@aphrody/shenron-config/home";
import { HomeHero } from "../src/components/home/HomeHero";
import {
  BEERUS_SLIDE_LIMIT,
  SLIDE_DURATION_MS,
  buildBeerusSlides,
  canAutoSwitch,
  formatAirDate,
  wrapIndex,
} from "../src/components/home/beerus-slides";

const episode = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  number: id - 800,
  title: `Episode ${id}`,
  ...extra,
});

describe("Beerus hero slides", () => {
  test("one slide per aired episode, newest first, capped at five", () => {
    const aired = Array.from({ length: 8 }, (_, i) => episode(870 + i));
    const slides = buildBeerusSlides(aired);
    expect(slides).toHaveLength(BEERUS_SLIDE_LIMIT);
    expect(slides.map((slide) => slide.id)).toEqual([877, 876, 875, 874, 873]);
  });

  test("no episode, no slide, no carousel", () => {
    expect(buildBeerusSlides([])).toEqual([]);
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
        <HomeHero
          hero={DEFAULT_HOME_CONFIG.hero}
          beerus={{ total: 0, latest: null, episodes: [] }}
        />
      </NextIntlClientProvider>,
    );
    expect(html).not.toContain('aria-roledescription="carrousel"');
  });

  test("a single episode never auto-switches and shows no controls", () => {
    expect(canAutoSwitch(0)).toBe(false);
    expect(canAutoSwitch(1)).toBe(false);
    expect(canAutoSwitch(2)).toBe(true);
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
        <HomeHero
          hero={DEFAULT_HOME_CONFIG.hero}
          beerus={{ total: 1, latest: episode(876), episodes: [episode(876)] }}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('aria-roledescription="carrousel"');
    expect(html).not.toContain(fr.accueil.hero.carousel.next);
  });

  test("image: qualified frame, then the episode image, never the generic banner", () => {
    const slides = buildBeerusSlides([
      episode(876),
      episode(901, { image: "https://cdn.dragonballfr.com/ep/901.webp" }),
      episode(902, { image: "/banners/dbs-beerus-2026.jpg" }),
    ]);
    const byId = Object.fromEntries(slides.map((slide) => [slide.id, slide.image]));
    expect(byId[902]).toBeNull();
    expect(byId[901]).toBe("https://cdn.dragonballfr.com/ep/901.webp");
    expect(byId[876]).toContain("/media/episodes/876/hero/");
  });

  test("the carousel is a labelled region of grouped slides with real timing", () => {
    const aired = [875, 876, 877].map((id) =>
      episode(id, { airDate: 1_790_000_000, duration: 1440 }),
    );
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
        <HomeHero
          hero={DEFAULT_HOME_CONFIG.hero}
          beerus={{ total: 3, latest: aired[2]!, episodes: aired }}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('aria-roledescription="carrousel"');
    expect(html.match(/aria-roledescription="diapositive"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="1 sur 3"');
    expect(html).toContain("24 min");
    expect(html).toContain(fr.accueil.hero.carousel.pause);
    expect(html).toContain("--slide-ms:7000ms");
    expect(SLIDE_DURATION_MS).toBe(7000);
    // First image is the LCP candidate; the logo stays single.
    expect(html.match(/fetchPriority="high"/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/src="\/official\/beerus\/logo-en\.webp"/g)).toHaveLength(1);
  });

  test("dates are relative when recent and absolute otherwise, in every locale", () => {
    const aired = Date.UTC(2026, 9, 30) / 1000;
    const now = Date.UTC(2026, 10, 1, 12);
    expect(formatAirDate(aired, "fr", now)).toBe("avant-hier");
    expect(formatAirDate(aired, "en", now)).toBe("2 days ago");
    expect(formatAirDate(aired, "fr", now + 40 * 86_400_000)).toContain("2026");
    expect(formatAirDate(aired, "ja")).toContain("2026");
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(5, 5)).toBe(0);
  });

  test("all locales carry the carousel strings", () => {
    const keys = Object.keys(fr.accueil.hero.carousel).toSorted();
    expect(Object.keys(en.accueil.hero.carousel).toSorted()).toEqual(keys);
    expect(Object.keys(ja.accueil.hero.carousel).toSorted()).toEqual(keys);
  });
});
