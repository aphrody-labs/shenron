// SPDX-License-Identifier: Apache-2.0
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { DEFAULT_HOME_CONFIG } from "../src/lib/home-scenes";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

const dictionaries = { fr, en, ja };
let locale: keyof typeof dictionaries = "fr";
const translate = (key: string) =>
  createTranslator({ locale, messages: dictionaries[locale] })(key as never);
mock.module("next-intl", () => ({
  useTranslations: (namespace: string) =>
    createTranslator({ locale, messages: dictionaries[locale], namespace } as never),
}));
mock.module("@/components/T", () => ({
  T: ({ k }: { k: string }) => translate(k),
  useT: () => translate,
}));
mock.module("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", { href, ...props }, children),
}));
const { HomeView } = await import("../src/components/home/HomeView");
const source = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("compact home", () => {
  test("renders search, four localized destinations and official Beerus links in every locale", () => {
    for (locale of ["fr", "en", "ja"] as const) {
      const html = renderToStaticMarkup(
        createElement(HomeView, { config: DEFAULT_HOME_CONFIG, access: null }),
      );
      expect(html).toContain('action="/wiki/search"');
      expect(html).toContain('name="q"');
      for (const [href, key] of [
        ["/wiki/manga", "categories.manga.label"],
        ["/wiki/databooks", "categories.databooks.label"],
        ["/wiki/episodes", "categories.episodes.label"],
        ["/sources/dragon-ball", "catalog.categories.sources"],
      ]) {
        expect(html).toContain(`href="${href}"`);
        expect(html).toContain(translate(key!));
      }
      expect(html).toContain('href="https://dragonball-super.com/en/"');
      expect(html).toContain(dictionaries[locale].dbsBeerus.watchEpisode);
      expect(html).toContain("home-wordmark");
      expect(html).toContain("kinto");
      for (const removed of [
        "universe",
        "community",
        "pantheon",
        "bestof",
        "tops",
        "canon",
        "actualites",
        "games",
        "sagas",
      ])
        expect(html).not.toContain(`id="${removed}"`);
      expect(html).not.toContain('href="/wiki/canon"');
      expect(html).not.toContain("home-resume");
    }
  });

  test("removed widgets no longer trigger their database or live bot loaders", async () => {
    const page = await source("../src/app/page.tsx");
    for (const loader of [
      "getShenron",
      "getWikiCounts",
      "getFeaturedCharacters",
      "getSagas",
      "getSagaBestOf",
      "getHomeCommunityTops",
      "listFeed",
      "readMediaCatalog",
      "getCanonConfig",
    ])
      expect(page).not.toContain(loader);
    expect(page).toContain("getLaunchConfig()");
    expect(page).toContain("export const revalidate = 900");
  });

  test("retained scenes keep reduced motion, visibility and lazy playback ownership", async () => {
    const backdrop = await source("../../../packages/ui/src/public/SceneBackdrop.tsx");
    expect(backdrop).toContain("prefers-reduced-motion");
    expect(backdrop).toContain('preload={shouldPlay ? "auto" : "none"}');
    expect(await source("../src/components/home/HomeHeroScenes.tsx")).toContain(
      "useScenePlaybackPolicy",
    );
  });
});
