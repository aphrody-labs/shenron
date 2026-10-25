// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  prepareReviewedVariantEdit,
  validateReviewedVariantManifest,
} from "../scripts/apply-reviewed-variant-edits";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

function fixture() {
  const expected = {
    id: 2449,
    characterId: 11,
    sagaId: 1,
    slug: "krilin-pilaf",
    visible: true,
    evidence: { methode: "ocr-manga", tomes: [2], planches: 6, mesureAt: 123 },
    summary: "Incorrect period",
    label: "Pilaf",
    displayName: "Krilin",
    nameJa: null,
    form: null,
    image: null,
    age: null,
    powerLevel: null,
    ki: null,
    maxKi: null,
    role: null,
    affiliation: null,
    highlights: [],
    techniqueIds: null,
    transformationIds: null,
    keyEpisodes: null,
  };
  return {
    version: 1,
    entries: [
      {
        id: 2449,
        rationale: "Chapter 25 is outside chapters 1–23",
        sources: [
          {
            file: "reviewed-scan.webp",
            sha256: "a".repeat(64),
            url: "https://dragonballfr.com/wiki/manga/1421?page=174",
            locator: "Chapter 25 heading",
          },
        ],
        expected,
        expectedSha256: wikiUpdateSnapshotHash(expected),
        patch: { visible: false },
      },
    ],
  };
}
test("reviewed patches preserve full CAS and rerun only the exact resulting state", () => {
  const item = validateReviewedVariantManifest(fixture()).entries[0]!;
  expect(prepareReviewedVariantEdit(item, item.expected)).toEqual({
    visible: false,
    expected: item.expected,
    expectedSha256: item.expectedSha256,
  });
  expect(prepareReviewedVariantEdit(item, { ...item.expected, visible: false })).toBeNull();
  expect(() =>
    prepareReviewedVariantEdit(item, { ...item.expected, summary: "Concurrent correction" }),
  ).toThrow("drift");
});
test("refuses altered measurements, identity edits, duplicate rows and false snapshot hashes", () => {
  const original = fixture();
  expect(() =>
    validateReviewedVariantManifest({
      ...original,
      entries: [...original.entries, ...original.entries],
    }),
  ).toThrow("Duplicate");
  expect(() =>
    validateReviewedVariantManifest({
      ...original,
      entries: [{ ...original.entries[0], patch: { characterId: 1 } }],
    }),
  ).toThrow();
  expect(() =>
    validateReviewedVariantManifest({
      ...original,
      entries: [{ ...original.entries[0], patch: { evidence: { planches: 99 } } }],
    }),
  ).toThrow("Measured");
  expect(() =>
    validateReviewedVariantManifest({
      ...original,
      entries: [{ ...original.entries[0], expectedSha256: "0".repeat(64) }],
    }),
  ).toThrow("snapshot");
});
test("requires qualified sources and typed catalogue IDs", () => {
  const original = fixture();
  const item = original.entries[0]!;
  expect(() =>
    validateReviewedVariantManifest({
      ...original,
      entries: [{ ...item, sources: [{ ...item.sources[0], url: "https://example.com/claim" }] }],
    }),
  ).toThrow("primary source");
  expect(() =>
    validateReviewedVariantManifest({
      ...original,
      entries: [{ ...item, patch: { techniqueIds: ["Kaioken"] } }],
    }),
  ).toThrow("techniqueIds");
  expect(() =>
    validateReviewedVariantManifest({ ...original, entries: [{ ...item, patch: {} }] }),
  ).toThrow("Empty");
});
