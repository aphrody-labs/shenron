// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { isCosmologyLocation } from "../src/components/wiki/CosmologyAtlas";
import {
  isSuppressedTocSectionLabel,
  mergeArticleAndColumnEvents,
  mergeArticleAndColumnSources,
  normalizeInternalDbfrUrl,
  normalizeInternalWikiSources,
  resolveMangaChapterHref,
  stripEmbeddedWikiMetadata,
} from "../src/lib/wiki-internal-sources";

describe("wiki SOMMAIRE filter suppression", () => {
  test("suppresses Repères canoniques, Combats Décisifs, and standalone Sources pills", () => {
    expect(isSuppressedTocSectionLabel("Repères canoniques")).toBe(true);
    expect(isSuppressedTocSectionLabel("Combats Décisifs (4)")).toBe(true);
    expect(isSuppressedTocSectionLabel("Combats Légendaires (2)")).toBe(true);
    expect(isSuppressedTocSectionLabel("Sources & références")).toBe(true);
    expect(isSuppressedTocSectionLabel("Références des guides officiels")).toBe(true);
  });

  test("preserves legitimate editorial sections and variant counts", () => {
    expect(isSuppressedTocSectionLabel("Présentation")).toBe(false);
    expect(isSuppressedTocSectionLabel("Variantes (15)")).toBe(false);
    expect(isSuppressedTocSectionLabel("Structure et règles cosmologiques")).toBe(false);
    expect(isSuppressedTocSectionLabel("Topographie et géographie du secteur")).toBe(false);
  });
});

describe("100% internal dragonballfr.com source URL normalization", () => {
  test("converts full dragonballfr.com URLs and legacy databook #planche anchors to ?page=", () => {
    expect(normalizeInternalDbfrUrl("https://dragonballfr.com/wiki/databooks/3#planche-71")).toBe(
      "/wiki/databooks/3?page=71",
    );
    expect(normalizeInternalDbfrUrl("/wiki/databooks/16?page=18")).toBe(
      "/wiki/databooks/16?page=18",
    );
    expect(normalizeInternalDbfrUrl("/wiki/personnages/son-goku")).toBe(
      "/wiki/characters/son-goku",
    );
    expect(normalizeInternalDbfrUrl("/wiki/cosmologie/autre-monde")).toBe("/wiki/locations");
  });

  test("rejects external domains and unsafe protocols", () => {
    expect(normalizeInternalDbfrUrl("https://dragonball.fandom.com/wiki/Afterlife")).toBeNull();
    expect(normalizeInternalDbfrUrl("https://fr.wikipedia.org/wiki/Dragon_Ball")).toBeNull();
    expect(normalizeInternalDbfrUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeInternalDbfrUrl("")).toBeNull();
  });

  test("resolves textual manga references to direct hosted reader routes", () => {
    expect(resolveMangaChapterHref("Chapitre 205 (Tome 18)")).toBe("/wiki/manga/20205");
    expect(resolveMangaChapterHref("Dragon Ball Super, Chapitre 13")).toBe("/wiki/manga/1327");
    expect(resolveMangaChapterHref("DBS Chapitres 39–41")).toBe("/wiki/manga/1353");
    expect(resolveMangaChapterHref("Tome 2")).toBe("/wiki/manga/volume/502");
  });

  test("filters and deduplicates WikiSource lists to strictly internal DBFR links", () => {
    const cleaned = normalizeInternalWikiSources([
      {
        n: 1,
        kind: "databook",
        label: "Daizenshuu 4, planche 71",
        url: "https://dragonballfr.com/wiki/databooks/3#planche-71",
      },
      {
        n: 2,
        kind: "web",
        label: "External wiki",
        url: "https://example.com/wiki",
      },
      {
        n: 3,
        kind: "databook",
        label: "Daizenshuu 4, planche 71",
        url: "/wiki/databooks/3?page=71",
      },
      {
        n: 4,
        kind: "databook",
        label: "Unlinked note",
        url: null,
      },
    ]);

    expect(cleaned).toEqual([
      {
        n: 1,
        kind: "databook",
        label: "Daizenshuu 4, planche 71",
        url: "/wiki/databooks/3?page=71",
      },
    ]);
  });

  test("parses embedded shenron-sources and shenron-events comments and strips them from prose", () => {
    const article = [
      "## Présentation",
      "",
      "Le Macrocosme englobe le Monde des Vivants et l'Autre Monde.",
      "",
      '<!-- shenron-events: [{"title":"Arrivée chez Enma","description":"Goku franchit le guichet céleste.","mangaRef":"Chapitre 205"}] -->',
      '<!-- shenron-sources: [{"n":1,"kind":"databook","label":"Daizenshuu 4, p. 71","url":"/wiki/databooks/3?page=71"},{"n":2,"kind":"web","label":"Fandom","url":"https://dragonball.fandom.com/wiki/Macrocosm"}] -->',
    ].join("\n");

    expect(stripEmbeddedWikiMetadata(article)).toBe(
      "## Présentation\n\nLe Macrocosme englobe le Monde des Vivants et l'Autre Monde.",
    );

    const sources = mergeArticleAndColumnSources(article, [
      {
        n: 9,
        kind: "databook",
        label: "Chōzenshū 1, p. 18",
        url: "https://dragonballfr.com/wiki/databooks/16#planche-18",
      },
    ]);
    expect(sources).toEqual([
      {
        n: 1,
        kind: "databook",
        label: "Daizenshuu 4, p. 71",
        url: "/wiki/databooks/3?page=71",
      },
      {
        n: 9,
        kind: "databook",
        label: "Chōzenshū 1, p. 18",
        url: "/wiki/databooks/16?page=18",
      },
    ]);

    const events = mergeArticleAndColumnEvents(article, [
      { title: "Old fallback", description: "Should be overridden" },
    ]);
    expect(events).toEqual([
      {
        title: "Arrivée chez Enma",
        description: "Goku franchit le guichet céleste.",
        mangaRef: "Chapitre 205",
      },
    ]);
  });
});

describe("Cosmology priority classification on /wiki/locations", () => {
  test("classifies all 14 Cosmology & Dimensional pillars ahead of planets and Earth", () => {
    expect(isCosmologyLocation({ slug: "macrocosme-univers-7", realm_type: "Cosmologie" })).toBe(
      true,
    );
    expect(isCosmologyLocation({ slug: "salle-esprit-temps", realm_type: "Dimension" })).toBe(true);
    expect(isCosmologyLocation({ slug: "planete-namek", realm_type: "Univers 7" })).toBe(false);
    expect(isCosmologyLocation({ slug: "sanctuaire-de-dieu", realm_type: "Terre" })).toBe(false);
  });
});
