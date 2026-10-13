// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  readEditorialCollections,
  validateJapaneseTranscriptEvidence,
} from "../../apps/site/src/lib/editorial-collections";
import { inventoryEditorialCollections } from "./editorial-collection-catalog";
import { resolve } from "node:path";

test("all requested collections preserve language, edition and unverified availability", () => {
  const result = readEditorialCollections();
  expect(result.collections).toHaveLength(18);
  expect(new Set(result.collections.map((row) => row.id)).size).toBe(18);
  expect(readEditorialCollections("soshuhen").collections[0]?.targetCount).toBe(18);
  expect(readEditorialCollections("dr-slump-anime").collections[0]?.subtitles).toEqual([
    "vost",
    "vostfr",
  ]);
  expect(readEditorialCollections("unknown").collections).toEqual([]);
  expect(result.complete).toBe(false);
  for (const collection of result.collections) {
    expect(collection.status).toBe("requested");
    expect(Object.keys(collection.labels).toSorted()).toEqual(["en", "fr", "ja"]);
    for (const source of collection.sources) {
      const url = new URL(source);
      expect(url.protocol).toBe("https:");
      expect(url.username).toBe("");
      expect(url.hostname).not.toContain("fandom");
    }
  }
});

test("English pivots cannot become Japanese source evidence or complete transcripts", () => {
  const evidence = {
    sourceLanguage: "ja",
    transcriptLanguage: "ja",
    sourceSha256: "a".repeat(64),
    transcriptSha256: "b".repeat(64),
    reviewStatus: "draft" as const,
    completeness: "partial" as const,
  };
  expect(validateJapaneseTranscriptEvidence(evidence)).toEqual({
    translationEligible: false,
    complete: false,
  });
  expect(() => validateJapaneseTranscriptEvidence({ ...evidence, pivotLanguage: "en" })).toThrow();
  expect(() =>
    validateJapaneseTranscriptEvidence({ ...evidence, transcriptLanguage: "fr" }),
  ).toThrow();
  expect(() =>
    validateJapaneseTranscriptEvidence({ ...evidence, sourceSha256: "missing" }),
  ).toThrow();
  expect(validateJapaneseTranscriptEvidence({ ...evidence, reviewStatus: "reviewed" })).toEqual({
    translationEligible: true,
    complete: false,
  });
});

test("local inventory hashes private files without exporting transcript text or claiming assets", async () => {
  const result = await inventoryEditorialCollections(resolve(import.meta.dir, "../.."));
  expect(result.completeCoverage).toBe(false);
  expect(result.collections).toHaveLength(18);
  expect(result.transcriptManifestCount).toBeGreaterThan(0);
  expect(
    result.collections.find((row) => row.id === "dr-slump-anime")?.historicalSnapshotRecords,
  ).toBe(0);
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain("imagePath");
  expect(serialized).not.toContain('"text"');
  expect(serialized).not.toContain("C:\\\\Users\\\\omara");
  for (const row of result.collections) expect(row.assetAvailability).toBe("unverified");
  for (const row of result.transcriptManifests)
    expect(row.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
});
