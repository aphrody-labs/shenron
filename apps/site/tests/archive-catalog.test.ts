// SPDX-License-Identifier: Apache-2.0
import { expect, test, mock } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  archiveEntries,
  archiveOptions,
  selectArchiveEntries,
  selectedArchiveEntry,
} from "../src/lib/archive-catalog";
import { archiveFilter } from "../src/lib/archive-catalog-query";

test("reviewed archive selection binds attributed records to real media, without private metadata", () => {
  expect(archiveEntries.length).toBeGreaterThan(0);
  expect(archiveEntries.length).toBeLessThanOrEqual(80);
  expect(new Set(archiveEntries.map((item) => item.url)).size).toBe(archiveEntries.length);
  for (const item of archiveEntries) {
    expect(item.url).toMatch(/^https:\/\/archive\.org\/details\/[a-zA-Z0-9._-]+$/);
    expect(item.mediaUrl).toStartWith(item.url.replace("/details/", "/download/") + "/");
    expect(item.preview).toStartWith(item.url.replace("/details/", "/download/") + "/");
    expect(item.mediaBytes).toBeGreaterThan(1024);
    expect(item.mediaMime).toMatch(
      item.mediaType === "movies" ? /^(video\/|application\/octet-stream)/ : /^image\//,
    );
    expect(item.metadataSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isNaN(Date.parse(item.checkedAt))).toBe(false);
    expect(JSON.stringify(item)).not.toMatch(/@|uploader|token|password/);
    expect(selectedArchiveEntry(item.category, item.url, item.recordTitle)).toBe(item);
    expect(
      selectedArchiveEntry(item.category, item.url, item.recordTitle + " changed"),
    ).toBeUndefined();
  }
});

test("work and source-language filters intersect and never broaden the selection", () => {
  for (const category of ["archive_movies", "archive_images"]) {
    const all = selectArchiveEntries(category);
    const options = archiveOptions(category);
    expect(all.length).toBeGreaterThan(0);
    for (const language of options.languages)
      for (const series of options.series) {
        expect(selectArchiveEntries(category, { mediaLang: language, series })).toEqual(
          all.filter((item) => item.language === language && item.series === series),
        );
      }
    expect(selectArchiveEntries(category, { mediaLang: "invalid" })).toEqual([]);
    expect(selectArchiveEntries(category, { series: "invalid" })).toEqual([]);
  }
  expect(selectArchiveEntries("sources")).toEqual([]);
  expect(
    selectedArchiveEntry(
      "archive_movies",
      "https://archive.org/details/00002-3",
      "Mayumi Sanjô & Etsuko Hara in Junketsu o kegasu (1979) Akira Ayanokôji",
    ),
  ).toBeUndefined();
});

const dialect = new PgDialect();
const queries: ReturnType<typeof dialect.sqlToQuery>[] = [];
let answers: unknown[][] = [];
mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({
  db: {
    execute: async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
      queries.push(dialect.sqlToQuery(query));
      return answers.shift() ?? [];
    },
  },
}));
mock.module("@/lib/wiki-launch-config", () => ({
  getLaunchConfig: async () => ({ openKeys: [], access: {} }),
}));
const { readCatalogPage, readCatalogDetail } = await import("../src/lib/catalog-explorer");
const { externalSourceId } = await import("../src/lib/external-source-catalog");

test("SQL enforces selection, successful observation and existing image permission before pagination", async () => {
  const entry = archiveEntries[0]!;
  queries.length = 0;
  answers = [
    [{ url: entry.url, title: entry.recordTitle, excerpt: "source notice", provenance: {} }],
    [{ total: 1 }],
  ];
  const page = await readCatalogPage(entry.category, {
    page: 2,
    mediaLang: entry.language,
    series: entry.series,
  });
  expect(page?.total).toBe(1);
  expect(page?.items[0]?.image).toBe(entry.preview);
  const [records, total] = queries;
  for (const query of [records!, total!]) {
    expect(query.sql).toContain("r.http_status between 200 and 299");
    expect(query.sql).toContain("publicImagesPermitted");
    expect(query.sql).toContain("reviewed");
    expect(query.params).toContain(entry.url);
    expect(query.params).toContain(entry.recordTitle);
  }
  expect(records!.params.slice(-2)).toEqual([48, 48]);
  expect(total!.sql).not.toContain("limit");
  expect(dialect.sqlToQuery(archiveFilter(entry.category, { series: "invalid" })).sql).toContain(
    "false",
  );
});

test("direct details fail closed for unselected, changed, unreviewed or disallowed archive records", async () => {
  const item = archiveEntries[0]!;
  const record = {
    url: item.url,
    kind: "archive",
    title: item.recordTitle,
    excerpt: "notice",
    httpStatus: 200,
    fetchedAt: new Date(),
    score: 0,
    provenance: {
      category: item.category.replace("_", "-"),
      reviewed: true,
      rights: { publicImagesPermitted: true },
    },
  };
  for (const patch of [
    { title: "changed" },
    { httpStatus: 404 },
    { provenance: { ...record.provenance, reviewed: false } },
    { provenance: { ...record.provenance, rights: { publicImagesPermitted: false } } },
  ]) {
    answers = [[{ ...record, ...patch }]];
    expect(await readCatalogDetail(item.category, externalSourceId(item.url))).toBeNull();
  }
  answers = [[record]];
  expect(
    (await readCatalogDetail(item.category, externalSourceId(item.url)))?.archive?.mediaUrl,
  ).toBe(item.mediaUrl);
});
