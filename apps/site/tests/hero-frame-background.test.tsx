import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { DEFAULT_HOME_CONFIG } from "@aphrody/shenron-config/home";
import { HomeHero } from "../src/components/home/HomeHero";
import { Billboard } from "../src/components/stream/Billboard";

// The DRAGONBALL.FR brand logo (93cdf44f) is the only non-frame image of the hero.
const BRAND_LOGO = /<img [^>]*src="\/brand\/dragonballfr-logo\.svg"[^>]*>/g;
const frameImages = (html: string) => html.replace(BRAND_LOGO, "").match(/<img /g);

test("the home uses a single supplied frame instead of static legacy backgrounds", () => {
  const frame = "https://cdn.dragonballfr.com/media/episodes/875/source/frame.webp";
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <HomeHero hero={{ ...DEFAULT_HOME_CONFIG.hero, scenes: [] }} heroFrame={frame} />
    </NextIntlClientProvider>,
  );
  expect(html.match(BRAND_LOGO)).toHaveLength(1);
  expect(frameImages(html)).toHaveLength(1);
  expect(html).toContain(`src="${frame}"`);
  expect(html).not.toContain("goku_normal");
  expect(html).not.toContain("dbs-beerus-2026.jpg");
});

test("the hero bounds its real frame mix and provides explicit motion controls", () => {
  const frames = Array.from(
    { length: 6 },
    (_, index) => `https://cdn.dragonballfr.com/media/episodes/875/hero-${index}.webp`,
  );
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <HomeHero hero={DEFAULT_HOME_CONFIG.hero} frames={frames} />
    </NextIntlClientProvider>,
  );
  expect(frameImages(html)).toHaveLength(4);
  expect(html).toContain(fr.accueil.hero.pauseFrames);
  expect(html).toContain('aria-pressed="false"');
  expect(html).not.toContain("<video");
});

test("a catalogue without a qualified frame keeps its title and action without a placeholder image", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <Billboard
        backdrop=""
        eyebrow="Series"
        title="Catalogue"
        primaryHref="/wiki/episodes"
        primaryLabel="Episodes"
      />
    </NextIntlClientProvider>,
  );
  expect(html).not.toContain("<img");
  expect(html).toContain("Catalogue");
  expect(html).toContain('href="/wiki/episodes"');
});

test("the homepage keeps one official series logo and both episode destinations", () => {
  const episodes = [875, 876].map((id, index) => ({
    id,
    number: index + 1,
    title: `Episode ${index + 1}`,
  }));
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <HomeHero
        hero={{ ...DEFAULT_HOME_CONFIG.hero, lede: "Présentation éditoriale" }}
        beerus={{ total: 2, latest: episodes[1]!, episodes }}
      />
    </NextIntlClientProvider>,
  );
  expect(html.match(/src="\/official\/beerus\/logo-en.webp"/g)).toHaveLength(1);
  expect(html).not.toContain("home-wordmark");
  expect(html).toContain("Présentation éditoriale");
  expect(html).toContain('href="/wiki/episodes/875"');
  expect(html).toContain('href="/wiki/episodes/876"');
});
