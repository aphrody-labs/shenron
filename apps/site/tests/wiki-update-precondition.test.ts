// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  assertWikiUpdatePrecondition,
  parseEpisodeUpdateRequest,
  WikiUpdatePreconditionError,
  wikiUpdateSnapshotHash,
} from "../src/lib/wiki-update-precondition";

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

test("complete episode snapshots catch concurrent frames and unrelated metadata", () => {
  const before = { id: 875, frames: null, durationSec: 1397, title: "Current" };
  const sha256 = wikiUpdateSnapshotHash(before);
  expect(() =>
    assertWikiUpdatePrecondition(before, before, { complete: true, sha256 }),
  ).not.toThrow();
  for (const changed of [
    { ...before, frames: [] },
    { ...before, title: "Concurrent edit" },
    { ...before, durationSec: 1398 },
  ]) {
    expect(() => assertWikiUpdatePrecondition(changed, before, { complete: true, sha256 })).toThrow(
      WikiUpdatePreconditionError,
    );
  }
  expect(() => assertWikiUpdatePrecondition(before, { frames: null }, { complete: true })).toThrow(
    WikiUpdatePreconditionError,
  );
  expect(() =>
    assertWikiUpdatePrecondition(before, before, { complete: true, sha256: "0".repeat(64) }),
  ).toThrow(WikiUpdatePreconditionError);
  expect(
    wikiUpdateSnapshotHash({ title: "Current", durationSec: 1397, frames: null, id: 875 }),
  ).toBe(sha256);
});

test("frame HTTP writes require a bounded snapshot plus SHA outside mutable data", () => {
  const expected = { id: 875, frames: null };
  const sha256 = wikiUpdateSnapshotHash(expected);
  const parsed = parseEpisodeUpdateRequest({ frames: [], expected, expectedSha256: sha256 });
  expect(parsed).toEqual({ data: { frames: [] }, expected, expectedSha256: sha256 });
  expect(parseEpisodeUpdateRequest({ title: "Metadata" })).toEqual({ data: { title: "Metadata" } });
  for (const invalid of [
    { frames: [] },
    { frames: [], expected },
    { frames: [], expected: null, expectedSha256: sha256 },
    { frames: [], expected: [], expectedSha256: sha256 },
    { frames: [], expected: {}, expectedSha256: sha256 },
    { frames: [], expected, expectedSha256: "not-a-hash" },
    {
      frames: [],
      expected: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), i])),
      expectedSha256: sha256,
    },
  ]) {
    expect(() => parseEpisodeUpdateRequest(invalid)).toThrow("snapshot and SHA256 required");
  }
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
