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

test("empty resources and empty player URLs do not render an invented summary", () => {
  expect(render({ players: [] })).toBe("");
  expect(
    render({
      players: [{ name: "Missing", provider: "Missing", embedUrl: "  " }],
      subtitles: NaN,
      frames: -1,
    }),
  ).toBe("");
});

test("real subtitle resources do not imply players or versions", () => {
  for (const locale of ["fr", "en", "ja"] as const) {
    const html = render({ players: [], subtitles: 2 }, locale);
    expect(html).toContain({ fr, en, ja }[locale].mediaPlayback.captions);
    expect(html.match(/<dt /g)?.length).toBe(1);
    expect(html).not.toContain("—");
  }
});

test("providers and languages are deduplicated and missing metadata remains absent", () => {
  const html = render({
    players: [
      { name: "One", provider: "ADN", embedUrl: "https://example.com/1", lang: "vostfr" },
      { name: "Two", provider: "ADN", embedUrl: "https://example.com/2", lang: "vostfr" },
    ],
  });
  expect(html.match(/<dt /g)?.length).toBe(2);
  expect(html).toContain('title="2 · ADN"');
  expect(html).toContain('title="VOSTFR"');
  expect(html).not.toContain("—");
  expect(
    render({
      players: [{ name: "Unknown", provider: "", embedUrl: "https://example.com/1" }],
    }).match(/<dt /g)?.length,
  ).toBe(1);
});
