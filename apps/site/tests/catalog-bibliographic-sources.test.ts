// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import manifest from "../../bot/data/manga-bibliography-manifest.json";
import { mangaVolumeBibliographicSource } from "../src/lib/manga-source-registry";

test("every imported publication resolves to its verified publisher bibliography", () => {
  expect(manifest.records).toHaveLength(100);
  for (const record of manifest.records) {
    expect(
      mangaVolumeBibliographicSource({
        id: record.legacyVolumeId,
        isbn: record.isbn,
        title: record.title,
      }),
    ).toEqual({ url: record.sourceUrl, label: record.publisher, language: record.language });
    expect(new URL(record.sourceUrl).hostname).toMatch(
      /^(?:(?:www\.)?(?:shueisha\.co\.jp|glenat\.com|hanmoto\.com)|books\.shueisha\.co\.jp|www\.(?:dreamnews\.jp|books\.or\.jp))$/,
    );
  }
});

test("French SD and Japanese SD never share a publisher URL by series and volume", () => {
  const fr = manifest.records.find((r) => r.work === "dragon_ball_sd" && r.language === "fr")!;
  const ja = manifest.records.find((r) => r.work === "dragon_ball_sd" && r.language === "ja")!;
  expect(
    mangaVolumeBibliographicSource({ id: fr.legacyVolumeId, isbn: fr.isbn, title: fr.title })?.url,
  ).toBe(fr.sourceUrl);
  expect(
    mangaVolumeBibliographicSource({ id: ja.legacyVolumeId, isbn: ja.isbn, title: ja.title })?.url,
  ).toBe(ja.sourceUrl);
  expect(fr.sourceUrl).not.toBe(ja.sourceUrl);
  expect(mangaVolumeBibliographicSource({ id: 99999, isbn: null, title: null })).toBeNull();
});

test("all eighteen Soshuhen ISBN notices retain bibliography while disputed release days stay unset", () => {
  const volumes = manifest.records.filter((record) => record.edition === "soshuhen");
  expect(volumes).toHaveLength(18);
  expect(new Set(volumes.map((record) => record.isbn)).size).toBe(18);
  expect(volumes.map((record) => record.legacyVolumeId)).toEqual(
    Array.from({ length: 18 }, (_, index) => 701 + index),
  );
  expect(volumes.slice(0, 3).map((record) => record.publishedAt)).toEqual([
    "2016-05-13",
    "2016-05-13",
    "2016-05-27",
  ]);
  expect(volumes.slice(3).every((record) => record.publishedAt === null)).toBe(true);
});

test("equivalent ISBN10 and ISBN13 identify one print publication", () => {
  const book = manifest.records.find((r) => r.isbn?.startsWith("978408"))!;
  const prefix = book.isbn!.slice(3, 12);
  const sum = [...prefix].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const check = (11 - (sum % 11)) % 11;
  const isbn10 = prefix + (check === 10 ? "X" : String(check));
  expect(
    mangaVolumeBibliographicSource({ id: book.legacyVolumeId, isbn: isbn10, title: book.title })
      ?.url,
  ).toBe(book.sourceUrl);
});

test("digital JDCN never borrows a paper ISBN or a different title's identity", () => {
  const digital = manifest.records.find((r) => r.jdcn !== null)!;
  expect(digital.isbn).toBeNull();
  expect(new URL(digital.sourceUrl).searchParams.get("jdcn")).toBe(digital.jdcn);
  expect(
    mangaVolumeBibliographicSource({
      id: digital.legacyVolumeId,
      isbn: "9784088738256",
      title: digital.title,
    }),
  ).not.toEqual({ url: digital.sourceUrl, label: digital.publisher, language: digital.language });
  expect(
    mangaVolumeBibliographicSource({ id: digital.legacyVolumeId, isbn: null, title: "Unknown" }),
  ).toBeNull();
});

test("a legacy publisher reference is retained only for its exact ISBN identity", () => {
  expect(mangaVolumeBibliographicSource({ id: 1, isbn: "9784088812618", title: null })?.url).toBe(
    "https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-881261-8",
  );
  expect(mangaVolumeBibliographicSource({ id: 1, isbn: "invalid", title: null })).toBeNull();
});
