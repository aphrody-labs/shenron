// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  databookPageRevisionSnapshots,
  isDatabookPageRevisionTarget,
  restoreDatabookPageRevision,
} from "../src/lib/databook-page-revisions";

test("snapshots stay bounded to changed editorial page numbers", () => {
  const before = {
    pages: [
      { number: "104", text: { kind: "markdown", markdown: "初" } },
      { number: 200, text: "Same" },
    ],
  };
  const after = structuredClone(before);
  after.pages[0]!.text = { kind: "markdown", markdown: "修正" };
  const delta = databookPageRevisionSnapshots(before, after);
  expect(Object.keys(delta.before)).toEqual(["pages#104"]);
  expect(isDatabookPageRevisionTarget("db_databooks", "pages#104", delta.before["pages#104"])).toBe(
    true,
  );
  expect(
    isDatabookPageRevisionTarget("db_characters", "pages#104", delta.before["pages#104"]),
  ).toBe(false);
  expect(databookPageRevisionSnapshots(before, before)).toEqual({ before: {}, after: {} });
});

test("page insertion, removal and reordering retain exact JSON during a reversal", () => {
  const original = [
    { number: 28, text: { kind: "text", text: "JA" }, text_fr: null },
    { number: 29, text: { kind: "markdown", markdown: "二" }, verified: false },
  ];
  for (const changed of [
    [...original, { number: 30, text: "New page" }],
    [original[0]],
    [original[1], original[0]],
    [],
  ]) {
    const unchanged = structuredClone(changed);
    const delta = databookPageRevisionSnapshots({ pages: original }, { pages: changed });
    expect(restoreDatabookPageRevision(changed, delta.before, delta.after)).toEqual(original);
    expect(changed).toEqual(unchanged);
  }
});

test("duplicate editorial numbers are retained as distinct exact slots", () => {
  const original = [
    { number: 28, text: "A" },
    { number: 28, text: "B" },
  ];
  const changed = [
    { number: 28, text: "New A" },
    { number: 28, text: "New B" },
  ];
  const delta = databookPageRevisionSnapshots({ pages: original }, { pages: changed });
  expect(Object.keys(delta.before)).toEqual(["pages#28", "pages#28@2"]);
  expect(restoreDatabookPageRevision(changed, delta.before, delta.after)).toEqual(original);
});
