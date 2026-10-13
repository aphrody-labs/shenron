import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { PageHero } from "../src/components/PageHero";
import { Billboard } from "../src/components/stream/Billboard";

test("site page heroes reject legacy artwork and preserve titles and descriptions", () => {
  const html = renderToStaticMarkup(
    <PageHero
      eyebrow="Wiki"
      title="Reference"
      lead="Verified description"
      image="/banners/legacy.jpg"
    />,
  );
  expect(html).not.toContain("<img");
  expect(html).not.toContain("legacy.jpg");
  expect(html).toContain("Reference");
  expect(html).toContain("Verified description");
  const frame = "https://cdn.dragonballfr.com/media/episodes/875/source/frame.png";
  expect(
    renderToStaticMarkup(<PageHero eyebrow="Wiki" title="Reference" image={frame} />),
  ).toContain(encodeURIComponent(frame));
});

test("billboards reject legacy backgrounds while keeping the editorial poster", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
      <Billboard
        backdrop="/banners/legacy.jpg"
        poster="/wiki/editorial-poster.webp"
        eyebrow="Film"
        title="Reference"
        primaryHref="/wiki/movies/1"
        primaryLabel="Details"
      />
    </NextIntlClientProvider>,
  );
  expect(html).not.toContain("legacy.jpg");
  expect(html).toContain("editorial-poster.webp");
  expect(html).toContain('href="/wiki/movies/1"');
});
