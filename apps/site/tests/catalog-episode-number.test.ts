// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { episodeNumberText } from "../src/lib/episode-number";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

mock.module("next-intl", () => ({
  useTranslations: () => (key: keyof typeof fr.mediaPlayback) => fr.mediaPlayback[key],
}));
mock.module("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
const { EpisodeCard } = await import("../src/components/stream/EpisodeCard");

test("series numbers remain nullable and known numbering remains unchanged", () => {
  expect(episodeNumberText(null)).toBeNull();
  expect(episodeNumberText(null, true)).toBeNull();
  expect(episodeNumberText(1)).toBe("1");
  expect(episodeNumberText(42, true)).toBe("042");
  expect(episodeNumberText(0)).toBeNull();
  expect(episodeNumberText(Number.NaN)).toBeNull();
});

test("an unnumbered episode card does not invent number zero or available languages", () => {
  const html = renderToStaticMarkup(
    createElement(EpisodeCard, {
      href: "/wiki/episodes/827",
      number: null,
      title: "Verified original title",
      image: null,
    }),
  );
  expect(html).toContain(fr.mediaPlayback.numberUnverified);
  expect(html).not.toContain("#000");
  expect(html).not.toContain("VOSTFR");
  expect(html).not.toContain("VF");
  const numbered = renderToStaticMarkup(
    createElement(EpisodeCard, {
      href: "/wiki/episodes/1",
      number: 1,
      title: "Known episode",
      image: null,
    }),
  );
  expect(numbered).toContain("#001");
});

test("the unverified number label exists in every supported interface language", () => {
  for (const messages of [fr, en, ja])
    expect(messages.mediaPlayback.numberUnverified.length).toBeGreaterThan(0);
});
