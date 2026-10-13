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
      <HomeHero hero={DEFAULT_HOME_CONFIG.hero} heroFrame={frame} />
    </NextIntlClientProvider>,
  );
  expect(html.match(/class="home-hero__beerus"/g)).toHaveLength(1);
  expect(html).toContain(encodeURIComponent(frame));
  expect(html).not.toContain("goku_normal");
  expect(html).not.toContain("dbs-beerus-2026.jpg");
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
