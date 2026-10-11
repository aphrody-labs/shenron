// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { mediaPublicationLink } from "../src/lib/media-publication-links";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

mock.module("server-only", () => ({}));
mock.module("@/lib/config", () => ({
  API_URL: "https://example.test",
  SITE_URL: "https://example.test",
  ASSET_BASE: "https://example.test",
}));
mock.module("@/lib/site-rag", () => ({
  chatAphrodyRag: async () => null,
  searchAphrodyRag: async () => [],
  usesAphrodyRag: () => false,
}));
mock.module("@/lib/admin-guard", () => ({ hasValidApiToken: () => false }));
mock.module("@/lib/databooks-redis", () => ({
  forgetDatabook: async () => {},
  indexDatabook: async () => {},
}));
mock.module("@/lib/wiki-revalidate", () => ({ revalidateWikiEntity: () => {} }));
let results: unknown[][] = [];
mock.module("@/lib/db", () => ({
  db: {
    select: () => {
      const rows = results.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        leftJoin: () => query,
        orderBy: () => Promise.resolve(rows),
        limit: () => Promise.resolve(rows),
      };
      return query;
    },
  },
}));

const book = {
  id: 486,
  title: "Illustrations",
  kind: "artbook",
  author: "Akira Toriyama",
  titleJa: null,
  isbn: "9784087925081",
  publishedAt: null,
  cover: null,
  description: null,
  sourceUrl: "https://www.shueisha.co.jp/books/",
  category: null,
  visible: true,
  pages: null,
};
const { GET: bookGET } = await import("../src/app/api/databooks/[id]/route");
const { dbUniverse } = await import("../src/lib/db-universe");
const { GET: mediaGET } = await import("../src/app/api/wiki/media/route");

test("the public databook API and page mapper retain stored ISBN without inventing pages", async () => {
  results = [[book]];
  const response = await bookGET(new Request("https://example.test/api/databooks/486"), {
    params: Promise.resolve({ id: "486" }),
  });
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.isbn).toBe(book.isbn);
  expect(json.pages).toEqual([]);
  expect(json.source_url).toBe(book.sourceUrl);
  results = [[book]];
  expect((await dbUniverse.databook(486))?.isbn).toBe(book.isbn);
  results = [[{ ...book, isbn: null }]];
  const unknown = await bookGET(new Request("https://example.test/api/databooks/486"), {
    params: Promise.resolve({ id: "486" }),
  });
  expect((await unknown.json()).isbn).toBeNull();
  results = [[{ ...book, visible: false }]];
  expect(
    (
      await bookGET(new Request("https://example.test/api/databooks/486"), {
        params: Promise.resolve({ id: "486" }),
      })
    ).status,
  ).toBe(404);
});

test("the existing media API exposes normalized editions and exact visible legacy links", async () => {
  const work = {
    id: 2,
    slug: "dragon-ball-sd",
    kind: "manga",
    series: "DB_SD",
    title: "Dragon Ball SD",
    titleJa: null,
    titleRomaji: null,
    synopsisFr: null,
  };
  const edition = {
    id: 9,
    workId: 2,
    edition: "tankobon",
    label: "Glénat",
    language: "fr",
    isbn: null,
    publisher: "Glénat",
    publishedAt: null,
    pageColor: "unknown",
    scanPolicy: "metadata_only",
  };
  results = [
    [work],
    [edition],
    [
      {
        id: 85,
        editionId: 9,
        number: "1",
        title: "Dragon Ball SD - Tome 01",
        legacyVolumeId: 728,
        visibleLegacyId: 728,
      },
      {
        id: 86,
        editionId: 9,
        number: "2",
        title: null,
        legacyVolumeId: 729,
        visibleLegacyId: null,
      },
    ],
  ];
  const response = await mediaGET(
    new NextRequest("https://example.test/api/wiki/media?slug=dragon-ball-sd"),
  );
  expect(response.status).toBe(200);
  const json = await response.json();
  const result = json.data[0].editions[0];
  expect(result.page_color).toBe("unknown");
  expect(result.scan_policy).toBe("metadata_only");
  expect(result.volumes_count).toBe(2);
  expect(result.volumes[0].href).toBe("/wiki/manga/volume/728");
  expect(result.volumes[0].api).toBe("/api/manga/volume/728");
  expect(result.volumes[1].href).toBeNull();
  expect(result.volumes[1].legacy_volume_id).toBeNull();
  expect("available" in result.volumes[0]).toBe(false);
});

test("publication links never substitute a different legacy identity and labels exist in all locales", () => {
  expect(
    mediaPublicationLink({
      id: 85,
      number: "1",
      title: null,
      legacyVolumeId: 728,
      visibleLegacyId: 729,
    }).href,
  ).toBeNull();
  for (const dictionary of [fr, en, ja]) {
    expect(dictionary.mangaCatalog.isbn).toBe("ISBN");
    expect(dictionary.mangaCatalog.editionsForWork).toContain("{title}");
    expect(dictionary.mangaCatalog.volumeCount).toContain("{count}");
    expect(dictionary.mangaCatalog.catalogueData.length).toBeGreaterThan(0);
  }
});
