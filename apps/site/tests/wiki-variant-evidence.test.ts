// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { assertVariantEvidenceUpdate } from "../src/lib/wiki-variant-evidence";

const measurements = {
  methode: "ocr-manga",
  tomes: [22],
  planches: 4,
  episodes: [],
  synopsis: 0,
  graphies: ["tenshinhan"],
  mesureAt: 1787661211645,
  legacyMeasurement: { retained: true },
};
const image = "./assets/wiki/generated-portraits/variant-2235.png";
const reference = {
  fields: ["summary", "highlights"],
  url: "https://dragonballfr.com/wiki/manga/1441?page=65",
  title: "Dragon Ball, chapitre 261",
  locator: "Tome 22, planche 65",
};
const artwork = {
  kind: "generated",
  image,
  referenceUrl: reference.url,
  referenceImageUrl: "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol22/065.webp",
  referenceTitle: reference.title,
  referenceSha256: "a".repeat(64),
  outputSha256: "b".repeat(64),
  generatedAt: "2026-10-25T13:00:00Z",
  generator: "image_gen",
};
const before = { image: null, evidence: measurements };

describe("variant evidence provenance", () => {
  test("adds documented artwork and primary field references without changing measurements", () => {
    const next = { ...measurements, imageArtwork: artwork, editorialReferences: [reference] };
    expect(() => assertVariantEvidenceUpdate(before, { image, evidence: next })).not.toThrow();
    expect(before.evidence).toEqual(measurements);
    expect(() =>
      assertVariantEvidenceUpdate({ ...before, image }, { evidence: next }),
    ).not.toThrow();
  });
  test("rejects dropped, invented or changed measurement keys", () => {
    for (const evidence of [
      null,
      {},
      [],
      { ...measurements, planches: 3 },
      { ...measurements, graphies: [] },
      { ...measurements, methode: "editorial" },
      { ...measurements, newMeasurement: 1 },
      { ...measurements, legacyMeasurement: null },
    ])
      expect(() => assertVariantEvidenceUpdate(before, { evidence })).toThrow();
    const { episodes: _, ...missing } = measurements;
    expect(() => assertVariantEvidenceUpdate(before, { evidence: missing })).toThrow(
      "Measured variant evidence",
    );
  });
  test("rejects untrusted, credential-bearing or non-HTTPS primary references", () => {
    for (const url of [
      "http://dragonballfr.com/wiki/manga/1441",
      "https://user:password@dragonballfr.com/wiki/manga/1441",
      "https://dragonball.fandom.com/wiki/Tien",
      "https://dragonballfr.com.evil.test/wiki/manga/1441",
      "https://127.0.0.1/wiki/manga/1441",
      "https://dragonballfr.com/wiki/characters/tenshinhan",
      "https://dragonballfr.com/wiki/manga/1441?token=private",
    ])
      expect(() =>
        assertVariantEvidenceUpdate(before, {
          evidence: { ...measurements, editorialReferences: [{ ...reference, url }] },
        }),
      ).toThrow("Invalid primary references");
  });
  test("bounds references and restricts their field names to public editorial values", () => {
    for (const item of [
      { ...reference, fields: ["origin"] },
      { ...reference, fields: ["evidence"] },
      { ...reference, fields: ["summary", "summary"] },
      { ...reference, locator: " " },
      { ...reference, token: "secret" },
    ])
      expect(() =>
        assertVariantEvidenceUpdate(before, {
          evidence: { ...measurements, editorialReferences: [item] },
        }),
      ).toThrow();
    expect(() =>
      assertVariantEvidenceUpdate(before, {
        evidence: {
          ...measurements,
          editorialReferences: Array.from({ length: 65 }, () => ({ ...reference })),
        },
      }),
    ).toThrow();
  });
  test("requires generated identity, hashes, timestamp, generator and matching resulting image", () => {
    for (const item of [
      { ...artwork, kind: "scan" },
      { ...artwork, outputSha256: "bad" },
      { ...artwork, referenceSha256: "bad" },
      { ...artwork, generatedAt: "yesterday" },
      { ...artwork, generator: "unknown" },
      { ...artwork, image: "./assets/wiki/generated-portraits/a/./b.png" },
      { ...artwork, referenceImageUrl: "https://external.example/ref.png" },
    ])
      expect(() =>
        assertVariantEvidenceUpdate(before, {
          image,
          evidence: { ...measurements, imageArtwork: item },
        }),
      ).toThrow();
    expect(() =>
      assertVariantEvidenceUpdate(before, {
        image: "./assets/wiki/generated-portraits/other.png",
        evidence: { ...measurements, imageArtwork: artwork },
      }),
    ).toThrow("match");
  });
  test("allows reviewed reference corrections and artwork rollback while retaining measurement keys", () => {
    const current = {
      image,
      evidence: { ...measurements, imageArtwork: artwork, editorialReferences: [reference] },
    };
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        evidence: {
          ...measurements,
          imageArtwork: artwork,
          editorialReferences: [
            reference,
            {
              ...reference,
              title: "Second primary reference",
              url: "https://en.dragon-ball-official.com/news/01_1235.html",
            },
          ],
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        evidence: { ...measurements, imageArtwork: artwork, editorialReferences: [] },
      }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate(current, { image: null, evidence: { ...measurements } }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        image: "./assets/dbz/officiel-2026-08-27/portrait.jpg",
        evidence: { ...measurements },
      }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        evidence: { ...measurements, editorialReferences: [reference] },
      }),
    ).toThrow("requires its provenance");
    expect(() => assertVariantEvidenceUpdate(current, { image: null })).toThrow("match");
  });
  test("keeps legacy edits without evidence compatible and refuses inventing a missing measurement", () => {
    expect(() => assertVariantEvidenceUpdate(before, { summary: "Reviewed text" })).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate({ evidence: null, image: null }, { image: "official.png" }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate({ evidence: null, image: null }, { evidence: null }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate({ evidence: null, image: null }, { evidence: measurements }),
    ).toThrow("Existing complete");
  });
});
