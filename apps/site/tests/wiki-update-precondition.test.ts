// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { assertWikiUpdatePrecondition } from "../src/lib/wiki-update-precondition";

test("null and missing values cannot erase concurrent pagination", () => {
  expect(() =>
    assertWikiUpdatePrecondition({ pageCount: null }, { pageCount: null }),
  ).not.toThrow();
  expect(() => assertWikiUpdatePrecondition({ pageCount: 215 }, { pageCount: null })).toThrow(
    "precondition changed",
  );
  expect(() => assertWikiUpdatePrecondition({}, { pageCount: null })).toThrow(
    "precondition changed",
  );
  expect(() => assertWikiUpdatePrecondition({ pageCount: null }, {})).toThrow("bounded fields");
});

test("preconditions compare explicit fields and do not surface protected values", () => {
  const row = { pageCount: null, privateRef: "protected-value", metadata: { revision: 3 } };
  expect(() =>
    assertWikiUpdatePrecondition(row, { pageCount: null, metadata: { revision: 3 } }),
  ).not.toThrow();
  try {
    assertWikiUpdatePrecondition(row, { privateRef: "different" });
    throw new Error("Expected precondition failure");
  } catch (error) {
    expect(String(error)).not.toContain("protected-value");
    expect(String(error)).not.toContain("different");
  }
  expect(row.pageCount).toBeNull();
});
