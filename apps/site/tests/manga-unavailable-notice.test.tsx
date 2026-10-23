// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { MangaUnavailableNotice } from "../src/components/manga/MangaUnavailableNotice";

function markup(locale: string, pageCount: number) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="UTC">
      <MangaUnavailableNotice pageCount={pageCount} />
    </NextIntlClientProvider>,
  );
}

test("a metadata-only volume explicitly declares unavailable reading in all supported languages", () => {
  for (const [locale, title] of [
    ["fr", "Lecture indisponible pour cette édition"],
    ["en", "Reading unavailable for this edition"],
    ["ja", "この版は閲覧できません"],
  ]) {
    const html = markup(locale!, 0);
    expect(html).toContain(title!);
    expect(html).toContain('href="/wiki/contribute"');
    expect(html).not.toContain("<button");
  }
});

test("readable volumes and official previews never receive the unavailable notice", () => {
  expect(markup("fr", 32)).toBe("");
  expect(markup("en", 193)).toBe("");
});
