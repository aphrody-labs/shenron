import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

mock.module("server-only", () => ({}));

import fr from "../messages/fr.json";
import wikiPublicFr from "../messages/wiki-public/fr.json";
import wikiPublicEn from "../messages/wiki-public/en.json";
import wikiPublicJa from "../messages/wiki-public/ja.json";
import { entryByKey } from "@aphrody/shenron-config/wiki-launch";
import { resolveWikiCategoryBlurb, WIKI_CATEGORIES } from "../src/lib/wiki-categories";
import {
  getWikiPortalMessages,
  getWikiReaderMessages,
} from "../src/lib/wiki-character-version-messages";
import { WikiSectionsReader } from "../src/components/wiki/WikiSectionsReader";
import { WikiArticle, WikiSources } from "../src/components/wiki/WikiArticle";
import { ContentCoverage } from "../src/components/wiki/ContentCoverage";

const { WikiEntityHeader } = await import("../src/components/wiki/WikiDetailPage");

describe("wiki modern overhaul — launch blurbs & trilingual dictionaries", () => {
  test("every WIKI_CATEGORIES entry resolves a non-empty descriptive blurb", () => {
    for (const cat of WIKI_CATEGORIES) {
      const entry = entryByKey(cat.key);
      expect(entry).toBeDefined();
      const blurb = resolveWikiCategoryBlurb(cat, entry?.blurb);
      expect(typeof blurb).toBe("string");
      expect((blurb ?? "").trim().length).toBeGreaterThan(10);
    }
  });

  test("wiki-public portal and reader dictionaries have identical keys across fr, en, ja", () => {
    const frPortalKeys = Object.keys(wikiPublicFr.portal).toSorted();
    const enPortalKeys = Object.keys(wikiPublicEn.portal).toSorted();
    const jaPortalKeys = Object.keys(wikiPublicJa.portal).toSorted();
    expect(enPortalKeys).toEqual(frPortalKeys);
    expect(jaPortalKeys).toEqual(frPortalKeys);

    const frReaderKeys = Object.keys(wikiPublicFr.reader).toSorted();
    const enReaderKeys = Object.keys(wikiPublicEn.reader).toSorted();
    const jaReaderKeys = Object.keys(wikiPublicJa.reader).toSorted();
    expect(enReaderKeys).toEqual(frReaderKeys);
    expect(jaReaderKeys).toEqual(frReaderKeys);

    expect(getWikiPortalMessages("fr")("lead", { total: "2 450" })).toContain("2 450");
    expect(getWikiPortalMessages("en")("lead", { total: "2,450" })).toContain("2,450");
    expect(getWikiPortalMessages("ja")("lead", { total: "2,450" })).toContain("2,450");
    expect(getWikiReaderMessages("fr")("sectionsCount", { count: 6 })).toBe("6 rubriques");
    expect(getWikiReaderMessages("en")("sectionsCount", { count: 6 })).toBe("6 sections");
    expect(getWikiReaderMessages("ja")("sectionsCount", { count: 6 })).toBe("全6セクション");
  });
});

describe("wiki modern overhaul — components & layout", () => {
  test("WikiEntityHeader renders structured identity banner with kanji and romaji", () => {
    const html = renderToStaticMarkup(
      <WikiEntityHeader
        name="Son Goku"
        nameJa="孫悟空"
        nameRomaji="Son Gokū"
        chips={<span>Personnage</span>}
        badges={<span>Saiyan</span>}
      />,
    );
    expect(html).toContain("Son Goku");
    expect(html).toContain("孫悟空");
    expect(html).toContain("Son Gokū");
    expect(html).toContain("Personnage");
    expect(html).toContain("Saiyan");
  });

  test("WikiSectionsReader renders section count badge and avoids negative-margin overflow", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
        <WikiSectionsReader
          panels={[
            { key: "overview", label: "Présentation", node: <p>Texte 1</p> },
            { key: "history", label: "Histoire", node: <p>Texte 2</p> },
            { key: "pws-1", label: "Arc Saiyan", group: "Puissances", node: <p>Texte 3</p> },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("3 rubriques");
    expect(html).toContain("Lecture intégrale");
    expect(html).toContain("Présentation");
    expect(html).toContain("Histoire");
    expect(html).toContain("Puissances");
    expect(html).not.toContain("-mx-[var(--wiki-shell-pad");
  });

  test("WikiArticle and WikiSources render structured reference cards and citation counts", () => {
    const sources = [
      {
        n: 1,
        kind: "databook",
        label: "Daizenshuu 7, p. 82",
        url: "https://dragonballfr.com/wiki/databooks",
      },
      { n: 2, kind: "manga_volume", label: "Tome 27, chapitre 321", url: null },
    ];
    const articleHtml = renderToStaticMarkup(
      <WikiArticle
        article="Histoire de **Son Goku** [1]."
        sources={sources}
        heading="Biographie"
      />,
    );
    expect(articleHtml).toContain("Biographie");
    expect(articleHtml).toContain('id="ref-1"');
    expect(articleHtml).toContain("Daizenshuu 7, p. 82");
    expect(articleHtml).toContain("Databook");
    expect(articleHtml).toContain("Manga");

    const sourcesHtml = renderToStaticMarkup(<WikiSources sources={sources} />);
    expect(sourcesHtml).toContain("Sources &amp; références");
    expect(sourcesHtml).toContain("2 réf.");
  });

  test("ContentCoverage renders visual progress bars for measured corpus metrics", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
        <ContentCoverage
          databooks={{
            label: "Databooks & interviews",
            availableHref: "/wiki/databooks?state=available",
            missingHref: "/wiki/databooks?state=incomplete",
            available: 18,
            total: 24,
            unit: "ouvrages",
          }}
          manga={{
            label: "Manga",
            availableHref: "/wiki/manga?state=available",
            missingHref: "/wiki/manga?state=incomplete",
            available: 42,
            total: 42,
            unit: "tomes",
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('data-coverage-pct="75"');
    expect(html).toContain("75%");
    expect(html).toContain('data-coverage-pct="100"');
    expect(html).toContain("100%");
    expect(html).toContain("Complet");
  });

  test("characters index page does not hardcode a 2-character filter", async () => {
    const source = await Bun.file(
      new URL("../src/app/wiki/characters/(index)/page.tsx", import.meta.url),
    ).text();
    expect(source).not.toContain("allowedCharacters");
    expect(source).toContain("characters.length");
  });
});
