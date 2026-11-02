import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import videoUiFr from "../messages/video-ui/fr.json";
import videoUiEn from "../messages/video-ui/en.json";
import videoUiJa from "../messages/video-ui/ja.json";
import { OffreLegale } from "../src/components/episodes/OffreLegale";
import { officialProviderName } from "../src/lib/video-languages";

const BRAND = /crunchyroll/i;
const ROOT = join(import.meta.dir, "..");

/** Every string of a dictionary with its dotted key; admin namespaces are staff-only. */
function visibleStrings(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if (path === "" && /^admin/i.test(key)) return [];
    return visibleStrings(child, path ? `${path}.${key}` : key);
  });
}

describe("provider brand never appears in public copy", () => {
  const dictionaries = {
    fr,
    en,
    ja,
    "video-ui/fr": videoUiFr,
    "video-ui/en": videoUiEn,
    "video-ui/ja": videoUiJa,
  };

  for (const [name, dictionary] of Object.entries(dictionaries)) {
    test(`dictionary ${name} has no brand string outside admin keys`, () => {
      const offenders = visibleStrings(dictionary).filter(([, text]) => BRAND.test(text));
      expect(offenders).toEqual([]);
    });
  }

  // Public components and pages: identifiers and imports may name the integration,
  // but no literal text, comment shown to readers or attribute may.
  const files = [
    "src/app/watchlist/page.tsx",
    "src/app/watchlist/WatchlistClient.tsx",
    "src/app/wiki/episodes/OfficialBeerusCard.tsx",
    "src/app/wiki/episodes/[id]/page.tsx",
    "src/app/wiki/episodes/series/[series]/page.tsx",
    "src/app/wiki/episodes/series/[series]/[number]/page.tsx",
    "src/app/wiki/movies/[slug]/page.tsx",
    "src/components/episodes/OffreLegale.tsx",
    "src/components/episodes/VideoSourceLinks.tsx",
    "src/components/episodes/VideoSourceSummary.tsx",
    "src/components/episodes/VideoLecteurs.tsx",
    "src/components/episodes/VideoUnavailableCard.tsx",
  ];
  for (const file of files) {
    test(`${file} has no brand literal`, () => {
      const source = readFileSync(join(ROOT, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/[A-Za-z_]*Crunchyroll[A-Za-z_]*/g, "") // identifiers
        .replace(/".?crunchyroll.com"/g, "") // host checks, never rendered
        .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?/gm, "");
      expect(source.match(BRAND)).toBeNull();
    });
  }
});

describe("officialProviderName", () => {
  test("replaces a branded provider or label by the neutral label", () => {
    expect(officialProviderName("crunchyroll", "Crunchyroll", "Official platform")).toBe(
      "Official platform",
    );
    expect(officialProviderName("other", "Watch on CRUNCHYROLL", "Official platform")).toBe(
      "Official platform",
    );
  });
  test("keeps unrelated provider labels", () => {
    expect(officialProviderName("adn", "ADN", "Official platform")).toBe("ADN");
  });
});

describe("OffreLegale rendering", () => {
  const offers = [
    {
      provider: "adn",
      label: "Crunchyroll",
      url: "https://example.com/watch/1",
      embedUrl: null,
      langs: ["vostfr"],
      available: true,
      checkedAt: 1,
    },
  ];

  for (const [locale, messages] of [
    ["fr", fr],
    ["en", en],
    ["ja", ja],
  ] as const) {
    test(`${locale}: visible text is neutral and the link is untouched`, () => {
      const html = renderToStaticMarkup(
        createElement(NextIntlClientProvider, {
          locale,
          messages: messages as never,
          timeZone: "UTC",
          children: createElement(OffreLegale, { offres: offers as never }),
        }),
      );
      const text = html.replace(/<[^>]*>/g, " ");
      expect(text).not.toMatch(BRAND);
      expect(html).toContain('href="https://example.com/watch/1"');
      expect(text).toContain(messages.mediaPlayback.officialPlatform);
    });
  }
});
