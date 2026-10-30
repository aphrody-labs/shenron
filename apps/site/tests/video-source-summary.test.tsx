// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import { VideoSourceSummary } from "../src/components/episodes/VideoSourceSummary";

function render(
  props: Parameters<typeof VideoSourceSummary>[0],
  locale: "fr" | "en" | "ja" = "fr",
) {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: { fr, en, ja }[locale],
      timeZone: "UTC",
      // oxlint-disable-next-line react/no-children-prop -- test fixture passes children explicitly
      children: createElement(VideoSourceSummary, props),
    }),
  );
}

test("empty resources distinguish untracked data from a verified missing source", () => {
  const html = render({ players: [] });
  expect(html).toContain("VF");
  expect(html).toContain("VOSTFR");
  expect(html).toContain("Non renseignée");
  expect(html).toContain("VO — audio original");
  expect(html).not.toContain("Manquante");
});

test("real subtitle resources do not imply players or versions", () => {
  for (const locale of ["fr", "en", "ja"] as const) {
    const html = render({ players: [], subtitles: 2 }, locale);
    const messages = { fr, en, ja }[locale].mediaPlayback;
    expect(html).toContain(messages.captions);
    expect(html).toContain(messages.sourceCoverage);
    // The original-audio label carries its own dash ("VO — audio original"); no other
    // dash may stand in for a missing player or version.
    expect(html.replaceAll(messages.vo, "")).not.toContain("—");
  }
});

test("listed versions and official offers are counted separately", () => {
  const html = render({
    players: [
      { name: "One", provider: "ADN", embedUrl: "https://example.com/1", lang: "vostfr" },
      { name: "Two", provider: "ADN", embedUrl: "https://example.com/2", lang: "vostfr" },
    ],
  });
  expect(html).toContain("2 lecteur(s) · 0 offre(s) officielle(s)");
  expect(html).toContain("VOSTFR");
  expect(html).toContain("Répertoriée");
  expect(html).toContain("VO sans sous-titres n’est pas distinguée");
  expect(html).toContain("VO — audio original");
});

test("saga coverage reports episode counts without implying full-series coverage", () => {
  const html = render({
    players: [],
    coverage: {
      total: 2,
      players: { vf: 1, vostfr: 2, vost: 0 },
      official: { vf: 2, vostfr: 2, vost: 0 },
      originalAudio: { players: 2, official: 2 },
    },
  });
  expect(html).toContain("1/2 épisode(s) avec lecteur · 2/2 avec offre officielle");
  expect(html).toContain("2/2 épisode(s) avec lecteur · 2/2 avec offre officielle");
  expect(html).toContain("VO — audio original");
});
