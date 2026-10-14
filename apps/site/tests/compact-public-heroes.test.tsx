import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { DEFAULT_HOME_CONFIG } from "../src/lib/home-scenes";
import { HomeHero } from "../src/components/home/HomeHero";
import { Billboard } from "../src/components/stream/Billboard";

test("home hero keeps identity and search within compact adaptive spacing", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <HomeHero hero={DEFAULT_HOME_CONFIG.hero} />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("min-h-60");
  expect(html).toContain("sm:min-h-72");
  expect(html).toContain("home-wordmark");
  expect(html).toContain('name="q"');
  expect(html).not.toContain("48svh");
  expect(html).toContain("goku_normal");
  expect(html).not.toContain("dbs-beerus-2026.jpg");
});

test("catalogue billboard grows for complete synopsis and keeps both navigation actions", () => {
  const synopsis = "A verified synopsis that remains entirely readable. ".repeat(20);
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <Billboard
        backdrop="/banner.webp"
        eyebrow="Series"
        title="Catalogue"
        synopsis={synopsis}
        primaryHref="/wiki/episodes/875"
        primaryLabel="Open episode"
        primaryHardNav
        secondaryHref="/wiki/timeline"
        secondaryLabel="Timeline"
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("min-h-64");
  expect(html).toContain("sm:min-h-80");
  expect(html).toContain(synopsis);
  expect(html).toContain('href="/wiki/episodes/875"');
  expect(html).toContain('href="/wiki/timeline"');
  expect(html).not.toContain("line-clamp");
  expect(html).not.toContain("70vh");
  expect(html).not.toContain("680px");
});
