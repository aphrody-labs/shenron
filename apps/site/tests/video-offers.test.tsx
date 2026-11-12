// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import { normalizeAvailability } from "../src/lib/video-languages";

let locale: "fr" | "en" | "ja" = "fr";
const dictionaries = { fr, en, ja };
const { OffreLegale } = await import("../src/components/episodes/OffreLegale");
const { VideoUnavailableCard } = await import("../src/components/episodes/VideoUnavailableCard");

const observed = {
  provider: "official",
  label: "Official provider",
  url: "https://provider.example/episode",
  available: true,
  langs: ["vostfr"],
  checkedAt: 100,
};

test("offer projection rejects malformed catalogues, unsafe destinations and missing observations", () => {
  for (const raw of [null, "scalar", {}, [null]]) expect(normalizeAvailability(raw)).toBeNull();
  for (const url of [
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://user:secret@google.com/",
  ])
    expect(normalizeAvailability([{ ...observed, url }])).toBeNull();
  expect(normalizeAvailability([{ ...observed, provider: "  " }])).toBeNull();
  expect(normalizeAvailability([{ ...observed, available: undefined }])).toBeNull();
  expect(normalizeAvailability([{ ...observed, langs: ["ja", "unknown"] }])?.[0]?.langs).toEqual(
    [],
  );
});

test("duplicate destinations retain the newest exact observation without stale language claims", () => {
  const older = { ...observed, checkedAt: 50, langs: ["vf", "vostfr"] };
  const latest = { ...observed, checkedAt: 200, langs: ["vost"] };
  for (const input of [
    [older, latest],
    [latest, older],
  ]) {
    const offers = normalizeAvailability(input);
    expect(offers).toHaveLength(1);
    expect(offers?.[0]?.langs).toEqual(["vost"]);
    expect(offers?.[0]?.checkedAt).toBe(200);
  }
  expect(normalizeAvailability([older, { ...latest, available: false }])).toBeNull();
  expect(normalizeAvailability([{ ...latest, available: false }, older])).toBeNull();
  expect(
    normalizeAvailability([observed, { ...observed, url: `${observed.url}/another` }]),
  ).toHaveLength(2);
});

test("official offers use observed localized versions and render each provider destination once", () => {
  const offers = normalizeAvailability([
    observed,
    observed,
    { ...observed, langs: ["vost", "unknown"] },
  ]);
  for (locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale,
        messages: dictionaries[locale],
        timeZone: "UTC",
        // oxlint-disable-next-line react/no-children-prop -- test fixture passes children explicitly
        children: createElement(OffreLegale, { offres: offers }),
      }),
    );
    expect(html).toContain(dictionaries[locale].mediaPlayback.watchLegally);
    expect(html).toContain(dictionaries[locale].mediaPlayback.vost);
    expect(html.match(/href=/g)).toHaveLength(1);
    expect(html).not.toContain("unknown");
    expect(html).not.toContain(dictionaries[locale].mediaPlayback.vostfr);
  }
  locale = "fr";
  const empty = renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: dictionaries[locale],
      timeZone: "UTC",
      // oxlint-disable-next-line react/no-children-prop -- test fixture passes children explicitly
      children: createElement(OffreLegale, { offres: [] }),
    }),
  );
  expect(empty).toBe("");
});

test("unavailable playback keeps localized episode and film contribution routes", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    for (const kind of ["episode", "film"] as const) {
      const html = renderToStaticMarkup(
        createElement(NextIntlClientProvider, {
          locale,
          messages: dictionaries[locale],
          timeZone: "UTC",
          // oxlint-disable-next-line react/no-children-prop -- test fixture passes children explicitly
          children: createElement(VideoUnavailableCard, { kind, title: "Observed title" }),
        }),
      );
      expect(html).toContain("Observed title");
      expect(html).toContain(`/wiki/contribute?type=${kind}`);
      if (locale !== "fr") expect(html).not.toContain("Proposer une source");
    }
  }
  locale = "fr";
});
