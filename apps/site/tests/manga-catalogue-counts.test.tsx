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
  const badge = html.match(/<button[^>]*data-collection="color"[\s\S]*?<\/button>/)?.[0];
  expect(badge).toContain('tabular-nums">0</span>');
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
  const badge = html.match(/<button[^>]*data-collection="color"[\s\S]*?<\/button>/)?.[0];
  expect(badge).toContain('tabular-nums">1</span>');
  expect(badge).not.toContain('tabular-nums">15</span>');
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
    // oxlint-disable-next-line oxc/no-map-spread -- immutable copy intended
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

test("every populated manga collection is visible before opening a menu, including recent editions", () => {
  const volume = (id: number, series: string) => ({
    id,
    series,
    volumeNumber: 1,
    title: null,
    cover: null,
  });
  const html = render({
    dbVolumes: [volume(1, "DB")],
    dbsVolumes: [volume(2, "DBS")],
    kanzenbanVolumes: [volume(3, "DBKZ")],
    dbjpVolumes: [volume(4, "DBJP")],
    araleVolumes: [volume(5, "ARALE")],
    otherVolumes: [volume(6, "DB_LIGHT_NOVELS")],
    readableChapters: [],
  });
  for (const series of ["all", "DB", "DBS", "DBKZ", "DBJP", "ARALE", "DB_LIGHT_NOVELS", "color"]) {
    const button = html.match(
      new RegExp(`<button[^>]*data-collection="${series}"[\\s\\S]*?<\\/button>`),
    )?.[0];
    expect(button).toBeDefined();
    expect(button).toContain("aria-pressed=");
    expect(button).toContain("min-h-11");
  }
  expect(html).not.toContain('<option value="DB">');
  expect(html).toContain('data-collection="all" aria-pressed="true"');
});

test("the server-rendered SOSH deep link respects its collection and page", () => {
  const html = render({
    initialSearch: "collection=SOSH&page=2",
    dbVolumes: [{ id: 1, series: "DB", volumeNumber: 1, title: null, cover: null }],
    dbsVolumes: [],
    soshuhenVolumes: Array.from({ length: 18 }, (_, index) => ({
      id: 701 + index,
      series: "SOSH",
      volumeNumber: index + 1,
      title: `Legend ${index + 1}`,
      cover: null,
    })),
    readableChapters: [],
  });
  expect(html).toContain('data-collection="SOSH" aria-pressed="true"');
  expect(html).toContain("Page 2 sur 2");
  expect(html).toContain('href="/wiki/manga/volume/713"');
  expect(html).toContain('href="/wiki/manga/volume/718"');
  expect(html).not.toContain('href="/wiki/manga/volume/701"');
  expect(html).not.toContain('href="/wiki/manga/volume/1"');
});
