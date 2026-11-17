// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

mock.module("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
mock.module("@/components/T", () => ({ useT: () => (key: string) => key }));
mock.module("@/components/manga/MangaReader", () => ({ MangaReader: () => null }));
let readerProps: Record<string, unknown> = {};
mock.module("@aphrody/shenron-ui/reader", () => ({
  CollectionReader: (props: Record<string, unknown>) => {
    readerProps = props;
    return createElement("div", null, String(props.contentsLabel));
  },
}));
const { UnifiedVolumeReader } = await import("../src/components/manga/UnifiedVolumeReader");

test("SOSH reading uses neutral source labels and localized controls in every supported locale", () => {
  for (const locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={{}} timeZone="UTC">
        <UnifiedVolumeReader
          volume={{
            id: 701,
            series: "SOSH",
            volume_number: 1,
            title: null,
            cover: null,
            chapters: [
              {
                id: 35001,
                series: "SOSH",
                chapter_number: 1,
                title: "Tome 1",
                pages: ["/one.webp"],
              },
              { id: 35002, series: "SOSH", chapter_number: 2, title: null, pages: [] },
            ],
          }}
        />
      </NextIntlClientProvider>,
    );
    const editions = readerProps.editions as Array<{
      label: string;
      chapters: Array<{ label: string; id: number; pageCount: number }>;
    }>;
    expect(editions[0]?.label).toBe(
      { fr: "N&B avec pages couleur", en: "B&W with colour pages", ja: "白黒・一部カラー" }[locale],
    );
    expect(editions[0]?.chapters).toEqual([
      { id: 35001, label: { fr: "Tome 1", en: "Volume 1", ja: "第1巻" }[locale], pageCount: 1 },
    ]);
    expect(html).toContain({ fr: "Sommaire", en: "Contents", ja: "目次" }[locale]);
    expect(readerProps.title).toBe({ fr: "Tome 1", en: "Volume 1", ja: "第1巻" }[locale]);
  }
});
