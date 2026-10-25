// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  matchPrintedPage,
  parseDatabook,
  parsePageIndices,
  privateOutputDirectory,
  resolveScanUrl,
} from "./audit-variant-databook-sources";

test("scan batches reject duplicate, invalid and more than four indices", () => {
  expect(parsePageIndices("78,79")).toEqual([78, 79]);
  for (const indices of ["0", "78,78", "1,2,3,4,5", "1.5", ""])
    expect(() => parsePageIndices(indices)).toThrow();
});

test("catalogue file indices never imply printed folios", () => {
  const source = parseDatabook({
    id: 4,
    title: "Daizenshuu 7",
    pages: [
      { number: 78, image: "./assets/wiki/databooks/scan.png", text: "Untrusted earlier OCR" },
    ],
  });
  expect(source.pages).toEqual([{ number: 78, image: "./assets/wiki/databooks/scan.png" }]);
  expect(matchPrintedPage(78, "a".repeat(64), [])).toBeNull();
  expect(() =>
    parseDatabook({ id: 4, title: "Book", pages: [{ number: 78 }, { number: 78 }] }),
  ).toThrow();
});

test("printed folio reviews are bound to exact scan hashes", () => {
  const review = {
    index: 78,
    printedPage: 82,
    sha256: "a".repeat(64),
    reviewerNote: "Printed folio visually inspected",
  };
  expect(matchPrintedPage(78, review.sha256, [review])?.printedPage).toBe(82);
  expect(() => matchPrintedPage(78, "b".repeat(64), [review])).toThrow();
  expect(() => matchPrintedPage(78, review.sha256, [review, review])).toThrow();
  expect(() => matchPrintedPage(78, review.sha256, [{ ...review, reviewerNote: "" }])).toThrow();
});

test("scan URLs cannot select external or privileged endpoints", () => {
  expect(resolveScanUrl("./assets/wiki/databooks/scan.png")).toBe(
    "https://cdn.dragonballfr.com/assets/wiki/databooks/scan.png",
  );
  for (const image of [
    "https://example.com/scan.png",
    "http://dragonballfr.com/wiki/databooks/scan.png",
    "/api/wiki-admin/db_databooks/4",
    "https://user:secret@dragonballfr.com/wiki/databooks/scan.png",
  ])
    expect(() => resolveScanUrl(image)).toThrow();
});

test("reports stay inside the private report directory", () => {
  expect(privateOutputDirectory("var/reports/book/")).toBe("var/reports/book");
  for (const path of ["docs/report", "var/reports/../../public", "C:/temp", "/var/reports/book"])
    expect(() => privateOutputDirectory(path)).toThrow();
});
