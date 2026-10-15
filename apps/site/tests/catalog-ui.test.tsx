// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

let locale: "fr" | "en" | "ja" = "fr";
const dictionaries = { fr, en, ja };
function translate(key: string, values?: Record<string, string | number>) {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      dictionaries[locale],
    );
  if (typeof value !== "string") throw new Error(`Missing UI label: ${key}`);
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    values?.[name] === undefined ? match : String(values[name]),
  );
}
mock.module("@/components/T", () => ({
  useT: () => translate,
  lookup: (dictionary: unknown, key: string) =>
    key
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dictionary),
  T: ({ k, values }: { k: string; values?: Record<string, string | number> }) =>
    translate(k, values),
}));
mock.module("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children?: ReactNode;
    href: string;
    prefetch?: boolean;
  }) => createElement("a", { href, ...props }, children),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock() }),
  usePathname: () => "/catalog",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("not-found");
  },
}));
const publicRecord = {
  category: "works",
  id: "42",
  title: "Published work",
  description: "Public notice",
  image: "https://publisher.example/cover.jpg",
  href: "/catalog/works/42",
  originalHref: null,
  fields: [],
  related: [],
  children: [],
  assets: ["https://publisher.example/cover.jpg"],
};
mock.module("@/lib/catalog-explorer", () => ({ readCatalogDetail: async () => publicRecord }));
mock.module("@/lib/cdn-catalog", () => ({
  readCdnPage: async () => ({
    index: { totalFiles: 200, observedAt: "2026-10-13T12:00:00Z", revision: "a".repeat(64) },
    directory: null,
    page: {
      path: "/",
      page: 0,
      totalPages: 2,
      entries: Array.from({ length: 200 }, (_, i) => ({
        path: `/public/cover-${i}.jpg`,
        mime: "image/jpeg",
        size: 1000,
        sha256: null,
      })),
    },
  }),
}));
const { CatalogAssetsNavigation } =
  await import("../src/components/catalog/CatalogAssetsNavigation");
const { CatalogControls, CATALOG_REFRESH_INTERVAL_MS } =
  await import("../src/components/catalog/CatalogControls");
const { CatalogCards, CatalogCategoryCards } =
  await import("../src/components/catalog/CatalogCards");
const { default: CatalogError } = await import("../src/app/catalog/error");
const { default: CatalogRecord } = await import("../src/app/catalog/[category]/[id]/page");
const { default: AssetsCatalog } = await import("../src/app/catalog/assets/page");

test("CDN navigation announces its current mode and parent folder in all interface locales", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    const folders = renderToStaticMarkup(
      createElement(CatalogAssetsNavigation, {
        all: false,
        parentHref: "/catalog/assets?path=%2Fassets%2F",
      }),
    );
    expect(folders).toContain(`aria-label="${dictionaries[locale].catalog.assets}"`);
    expect(folders).toContain('href="/catalog/assets" aria-current="page"');
    expect(folders).toContain(dictionaries[locale].catalog.parent);
    expect(folders).toContain('href="/catalog/assets?path=%2Fassets%2F"');
    const all = renderToStaticMarkup(
      createElement(CatalogAssetsNavigation, {
        all: true,
        parentHref: "/catalog/assets?path=%2Fassets%2F",
      }),
    );
    expect(all).toContain('href="/catalog/assets?all=1" aria-current="page"');
    expect(all).not.toContain(dictionaries[locale].catalog.parent);
  }
});
test("catalogue controls keep a labelled search and the ancestor filter without stale page parameters", () => {
  locale = "fr";
  const html = renderToStaticMarkup(
    createElement(CatalogControls, { search: "Dragon <Ball>", parent: "42" }),
  );
  expect(html).toContain("<search");
  expect(html).toContain('for="catalog-search"');
  expect(html).toContain('name="q"');
  expect(html).toContain('value="Dragon &lt;Ball&gt;"');
  expect(html).toContain('name="parent" value="42"');
  expect(html).not.toContain('name="page"');
  expect(html).toContain(
    translate("catalog.automatic", { seconds: CATALOG_REFRESH_INTERVAL_MS / 1000 }),
  );
  expect(html).not.toContain("{seconds}");
  expect(html).toContain("<output");
});
test("catalogue cards use public previews and every empty list has a way back", () => {
  const html = renderToStaticMarkup(
    createElement(CatalogCards, {
      items: [
        {
          category: "works",
          id: "42",
          title: "Published work",
          description: "Public notice",
          image: "/wiki/public-cover.jpg",
          href: "/catalog/works/42",
          originalHref: null,
        },
      ],
    }),
  );
  expect(html).toContain('src="/wiki/public-cover.jpg"');
  expect(html).toContain('href="/catalog/works/42"');
  expect(html).toContain("Published work");
  expect(html).toContain("Public notice");
  const empty = renderToStaticMarkup(createElement(CatalogCards, { items: [] }));
  expect(empty).toContain('href="/catalog"');
  expect(empty).toContain(dictionaries.fr.catalog.empty);
  const categories = renderToStaticMarkup(
    createElement(CatalogCategoryCards, {
      categories: [{ category: "works", total: 48, href: "/catalog/works" }],
    }),
  );
  expect(categories).toContain(dictionaries.fr.catalog.categories.works);
  expect(categories).toContain("48 fiches");
});
test("archive filters expose only observed works and declared languages in all locales", () => {
  for (locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(
      createElement(CatalogControls, {
        search: "",
        archiveCategory: "archive_movies",
        series: "gt",
        mediaLang: "pt",
      }),
    );
    expect(html).toContain('name="series"');
    expect(html).toContain('name="mediaLang"');
    expect(html).toContain('value="gt" selected=""');
    expect(html).toContain(dictionaries[locale].catalog.archive.language);
    expect(html).toContain(dictionaries[locale].catalog.archive.languages.unknown);
    expect(html).not.toContain('name="page"');
    expect(html).not.toContain('value="heroes"');
  }
  locale = "fr";
});
test("catalogue failures expose a retry and a public exit without infrastructure details", () => {
  const html = renderToStaticMarkup(createElement(CatalogError, { reset: mock() }));
  expect(html).toContain('role="alert"');
  expect(html).toContain(dictionaries.fr.catalog.unavailable);
  expect(html).toContain(dictionaries.fr.catalog.refresh);
  expect(html).toContain('href="/catalog"');
  expect(html).not.toContain("DATABASE_URL");
});

test("record primary images remain direct public sources without arbitrary-host image optimization", async () => {
  const html = renderToStaticMarkup(
    await CatalogRecord({ params: Promise.resolve({ category: "works", id: "42" }) }),
  );
  expect(html).toContain('src="https://publisher.example/cover.jpg"');
  expect(html).toContain('alt="Published work"');
  expect(html).not.toContain("/_next/image");
  expect(html).toContain("Ouvrir le fichier: https://publisher.example/cover.jpg");
});
test("CDN files retain complete pagination while lazy previews are bounded to the owned public origin", async () => {
  const html = renderToStaticMarkup(
    await AssetsCatalog({ searchParams: Promise.resolve({ all: "1", page: "1" }) }),
  );
  expect(html.match(/<img\b/g)).toHaveLength(96);
  expect(html.match(/loading="lazy"/g)).toHaveLength(96);
  expect(html).toContain('href="https://cdn.dragonballfr.com/public/cover-199.jpg"');
  expect(html).toContain('href="/catalog/assets?path=%2F&amp;page=2&amp;all=1"');
  expect(html).not.toContain("/_next/image");
});
