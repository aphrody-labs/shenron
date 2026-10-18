import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { DEFAULT_HOME_CONFIG } from "../src/lib/home-scenes";
import { HomeHero } from "../src/components/home/HomeHero";
import { Billboard } from "../src/components/stream/Billboard";

test("the home uses a single supplied frame instead of static legacy backgrounds", () => {
  const frame = "https://cdn.dragonballfr.com/media/episodes/875/source/frame.webp";
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <HomeHero hero={{ ...DEFAULT_HOME_CONFIG.hero, scenes: [] }} heroFrame={frame} />
    </NextIntlClientProvider>,
  );
  expect(html.match(/<img /g)).toHaveLength(1);
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
  expect(html.match(/<img /g)).toHaveLength(4);
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
