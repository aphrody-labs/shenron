// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fr from "../messages/fr.json";

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

test("the color collection reports available volumes without inventing a catalogue on empty data", () => {
  const html = renderToStaticMarkup(
    <MangaVolumeGrid dbVolumes={[]} dbsVolumes={[]} readableChapters={[]} />,
  );
  const badge = html.match(/id="manga-tab-full_color"[\s\S]*?<\/button>/)?.[0];
  expect(badge).toContain("0 tomes");
  expect(badge).not.toContain("520 tomes");
});

test("the color badge counts volumes rather than chapters", () => {
  const html = renderToStaticMarkup(
    <MangaVolumeGrid
      dbVolumes={[{ id: 82, series: "DB", volumeNumber: 1, title: "Volume", cover: null }]}
      dbsVolumes={[]}
      readableChapters={[]}
      colorVolumeIds={[82]}
      colorChapterCount={15}
    />,
  );
  const badge = html.match(/id="manga-tab-full_color"[\s\S]*?<\/button>/)?.[0];
  expect(badge).toContain("1 tomes");
  expect(badge).not.toContain("15 tomes");
});

test("the complete catalogue keeps its count while initially rendering twelve covers per collection", () => {
  const volumes = Array.from({ length: 42 }, (_, index) => ({
    id: index + 1,
    series: "DB",
    volumeNumber: index + 1,
    title: `Volume ${index + 1}`,
    cover: null,
  }));
  const html = renderToStaticMarkup(
    <MangaVolumeGrid dbVolumes={volumes} dbsVolumes={[]} readableChapters={[]} />,
  );
  expect((html.match(/href="\/wiki\/manga\/volume\//g) ?? []).length).toBe(12);
  expect(html).toContain("42");
  expect(html).toContain("Afficher 12 tomes de plus");
});
