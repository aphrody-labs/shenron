// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import {
  WikiMediaJumpLinks,
  WikiMediaMetrics,
  WikiMediaSpotlight,
} from "../src/components/wiki/WikiMediaCatalogue";
import { StreamingHero } from "../src/components/streaming/StreamingHero";
import { DatabookGrid } from "../src/components/databooks/DatabookGrid";
import { wikiMediaCatalogueMessages } from "../src/lib/wiki-media-catalogue-messages";
import fr from "../messages/wiki-media-catalogue/fr.json";
import en from "../messages/wiki-media-catalogue/en.json";
import ja from "../messages/wiki-media-catalogue/ja.json";

test("media vocabulary and interpolations are complete in all supported languages", () => {
  for (const dictionary of [en, ja]) {
    expect(Object.keys(dictionary).toSorted()).toEqual(Object.keys(fr).toSorted());
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(dictionary[key].length).toBeGreaterThan(0);
      expect(dictionary[key].match(/\{\w+\}/g) ?? []).toEqual(fr[key].match(/\{\w+\}/g) ?? []);
    }
  }
  expect(
    wikiMediaCatalogueMessages("en")("mangaLead", { readable: 2, chapters: 3, total: 4 }),
  ).toContain("2 readable volumes, 3 chapters and 4 listed volumes");
});

test("catalogue metrics associate their measured value and hint with a visible term", () => {
  const html = renderToStaticMarkup(
    <WikiMediaMetrics
      label="Catalogue coverage"
      items={[{ key: "books", label: "Books", value: 42, hint: "12 with pages" }]}
    />,
  );
  expect(html).toContain('aria-labelledby="media-coverage-heading"');
  expect(html).toContain("<dt>Books</dt><dd>42<small>12 with pages</small></dd>");
});

test("a spotlight preserves independent navigations without a second page heading", () => {
  const html = renderToStaticMarkup(
    <WikiMediaSpotlight
      title="A published work"
      eyebrow="Featured"
      primary={{ href: "/wiki/movies/example", label: "Watch", hardNav: true }}
      secondary={{ href: "/wiki/timeline", label: "Timeline" }}
    />,
  );
  expect(html).toContain('<h2 id="featured-media-title"');
  expect(html).not.toContain("<h1");
  expect(html).not.toContain('data-media-artwork="present"');
  expect(html.match(/<a /g)).toHaveLength(2);
  expect(html).toContain('href="/wiki/movies/example"');
  expect(html).toContain('href="/wiki/timeline"');
});

test("jump links retain real catalogue destinations and counts", () => {
  const html = renderToStaticMarkup(
    <WikiMediaJumpLinks
      label="Explore eras"
      items={[{ key: "db", href: "#films-DB", label: "Dragon Ball", count: 4 }]}
    />,
  );
  expect(html).toContain('aria-label="Explore eras"');
  expect(html).toContain('href="#films-DB"');
  expect(html).toContain("Dragon Ball<span>4</span>");
});

test("an episode spotlight remains operable beneath a catalogue h1", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{}} timeZone="UTC">
      <StreamingHero
        headingLevel={2}
        seriesLabel="Dragon Ball"
        episode={{
          id: 1,
          series: "DB",
          number: 1,
          title: "First adventure",
          titleJa: null,
          image: null,
          synopsis: "A catalogue synopsis",
          year: 1986,
          languages: ["vf"],
          hasPlayback: true,
          duration: 1200,
        }}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain('<h2 id="streaming-title"');
  expect(html).not.toContain("<h1");
  expect(html).toContain('href="/wiki/episodes/1"');
  expect(html).toContain('href="/wiki/episodes/series/DB"');
  expect(html).toContain('aria-pressed="false"');
});

test("databooks render translated filters, real pagination and an explicit missing cover", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">
      <DatabookGrid
        items={[
          {
            id: 1,
            kind: "databook",
            category: "Autre",
            title: "Published guide",
            titleJa: null,
            author: null,
            publishedAt: null,
            cover: null,
            pageCount: 0,
            hasDescription: true,
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain("Search by title, author or category");
  expect(html).toContain("Other publications");
  expect(html).toContain("Cover to complete");
  expect(html).toContain("Editorial profile");
  expect(html).toContain('href="/wiki/databooks/1"');
});
