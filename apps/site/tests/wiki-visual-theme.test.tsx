// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  wikiSourceSection,
  wikiVisualSection,
  wikiVisualTopic,
} from "../src/lib/wiki-visual-theme";
import { getWikiPortalMessages } from "../src/lib/wiki-character-version-messages";
import catalogueFr from "../messages/wiki-catalogue/fr.json";
import catalogueEn from "../messages/wiki-catalogue/en.json";
import catalogueJa from "../messages/wiki-catalogue/ja.json";

let pathname: string | null = "/wiki";
mock.module("next/navigation", () => ({ usePathname: () => pathname }));
const { WikiVisualFrame } = await import("../src/components/wiki/WikiVisualFrame");
const { WikiPortalText } = await import("../src/components/wiki/WikiPortalText");

afterEach(() => {
  pathname = "/wiki";
});

describe("wiki visual scope", () => {
  test("characters and techniques remain excluded at every depth", () => {
    for (const route of [
      "/wiki/characters",
      "/wiki/characters/goku",
      "/wiki/techniques",
      "/wiki/techniques/kamehameha",
    ]) {
      expect(wikiVisualSection(route)).toBeNull();
    }
    expect(wikiVisualSection("/wiki/characters-other")).toBe("characters-other");
    expect(wikiVisualSection("/wikimedia")).toBeNull();
    expect(wikiVisualSection(null)).toBeNull();
  });

  test("SSR emits the route's theme and keeps excluded markup unchanged", () => {
    pathname = "/wiki/locations/kame-house";
    let html = renderToStaticMarkup(
      <WikiVisualFrame>
        <p>Content</p>
      </WikiVisualFrame>,
    );
    expect(html).toContain('data-wiki-section="locations"');
    expect(html).toContain('data-wiki-topic="namek"');
    pathname = "/wiki/characters/goku";
    html = renderToStaticMarkup(
      <WikiVisualFrame>
        <p>Content</p>
      </WikiVisualFrame>,
    );
    expect(html).toBe('<div data-wiki-surface="true"><p>Content</p></div>');
  });

  test("navigation between redesigned and excluded routes does not retain a theme", () => {
    for (const route of [
      "/wiki/items",
      "/wiki/techniques/kamehameha",
      "/wiki/manga/1",
      "/wiki/characters",
      "/wiki",
    ]) {
      pathname = route;
      const html = renderToStaticMarkup(
        <WikiVisualFrame>
          <p>Content</p>
        </WikiVisualFrame>,
      );
      const active = wikiVisualSection(route);
      expect(html.includes("data-wiki-topic=")).toBe(active !== null);
    }
  });

  test("all source tables and unknown public wiki pages have a stable topic", () => {
    expect(wikiSourceSection("db_locations")).toBe("locations");
    expect(wikiVisualTopic("locations")).toBe("namek");
    expect(wikiVisualTopic("databooks")).toBe("archive");
    expect(wikiVisualTopic("future-section")).toBe("adventure");
  });
});

test("the cached portal uses the shell's reference language during SSR", () => {
  const html = renderToStaticMarkup(<WikiPortalText name="eyebrow" />);
  expect(html).toBe(getWikiPortalMessages("fr")("eyebrow"));
  expect(html).not.toBe(getWikiPortalMessages("en")("eyebrow"));
});

test("new catalogue controls have complete French, English and Japanese dictionaries", () => {
  expect(Object.keys(catalogueEn).toSorted()).toEqual(Object.keys(catalogueFr).toSorted());
  expect(Object.keys(catalogueJa).toSorted()).toEqual(Object.keys(catalogueFr).toSorted());
  for (const dictionary of [catalogueFr, catalogueEn, catalogueJa]) {
    for (const value of Object.values(dictionary)) expect(value.trim().length).toBeGreaterThan(0);
  }
});
