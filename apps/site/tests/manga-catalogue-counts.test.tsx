// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import { NextIntlClientProvider } from "next-intl";

mock.module("@/components/T", () => ({
  useT:
    () =>
    (key: string, values: Record<string, string | number> = {}) => {
      const text = key
        .split(".")
        .reduce<unknown>(
          (value, part) =>
            value && typeof value === "object"
              ? (value as Record<string, unknown>)[part]
              : undefined,
          fr,
        );
      return typeof text === "string"
        ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""))
        : key;
    },
}));
mock.module("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

const { MangaVolumeGrid } = await import("../src/components/manga/MangaVolumeGrid");

function render(props: Parameters<typeof MangaVolumeGrid>[0], locale: "fr" | "en" | "ja" = "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ fr, en, ja }[locale]} timeZone="UTC">
      <MangaVolumeGrid {...props} />
    </NextIntlClientProvider>,
  );
}

test("the color collection reports available volumes without inventing a catalogue on empty data", () => {
  const html = render({ dbVolumes: [], dbsVolumes: [], readableChapters: [] });
  const badge = html.match(/<option value="color">[\s\S]*?<\/option>/)?.[0];
  expect(badge).toContain("· 0");
  expect(badge).not.toContain("520 tomes");
});

test("the color badge counts volumes rather than chapters", () => {
  const html = render({
    dbVolumes: [{ id: 82, series: "DB", volumeNumber: 1, title: "Volume", cover: null }],
    dbsVolumes: [],
    readableChapters: [],
    colorVolumeIds: [82],
    colorChapterCount: 15,
  });
  const badge = html.match(/<option value="color">[\s\S]*?<\/option>/)?.[0];
  expect(badge).toContain("· 1");
  expect(badge).not.toContain("· 15");
});

test("the complete catalogue renders at most twelve covers across all collections", () => {
  const volumes = Array.from({ length: 42 }, (_, index) => ({
    id: index + 1,
    series: "DB",
    volumeNumber: index + 1,
    title: `Volume ${index + 1}`,
    cover: null,
  }));
  const html = render({
    dbVolumes: volumes,
    dbsVolumes: volumes.map((volume) => ({ ...volume, id: volume.id + 100, series: "DBS" })),
    readableChapters: [],
  });
  expect((html.match(/href="\/wiki\/manga\/volume\//g) ?? []).length).toBe(12);
  expect(html).toContain("84");
  expect(html).toContain("Page 1 sur 7");
});

test("the compact catalogue controls use the active French, English and Japanese locale", () => {
  for (const locale of ["fr", "en", "ja"] as const) {
    const html = render({ dbVolumes: [], dbsVolumes: [], readableChapters: [] }, locale);
    expect(html).toContain(
      {
        fr: "Rechercher un titre ou un numéro",
        en: "Search by title or number",
        ja: "タイトルや番号で検索",
      }[locale],
    );
    expect(html).toContain(
      { fr: "Toutes les collections", en: "All collections", ja: "すべてのコレクション" }[locale],
    );
  }
});
