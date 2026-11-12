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
const imageHash = "c".repeat(64);
const image = `https://cdn.dragonballfr.com/assets/wiki/variants/manga-${imageHash}.jpg`;
const reference = {
  fields: ["image"],
  url: "https://dragonballfr.com/wiki/manga/1441?page=65",
  title: "Dragon Ball, chapitre 261",
  locator: `Tome 22, planche 65; SHA-256 ${imageHash}`,
};
const before = { image: null, evidence: measurements };

describe("variant evidence provenance", () => {
  test("adds a source-hashed primary image reference without changing measurements", () => {
    const next = { ...measurements, editorialReferences: [reference] };
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
  test("rejects generated artwork metadata and unreferenced image changes", () => {
    expect(() =>
      assertVariantEvidenceUpdate(before, {
        image,
        evidence: { ...measurements, imageArtwork: { kind: "generated", generator: "image_gen" } },
      }),
    ).toThrow("Invalid primary references");
    expect(() => assertVariantEvidenceUpdate(before, { image })).toThrow(
      "primary source reference",
    );
    expect(() =>
      assertVariantEvidenceUpdate(before, {
        image: "https://google.com/generated.png",
        evidence: { ...measurements, editorialReferences: [reference] },
      }),
    ).toThrow("primary source image");
  });
  test("requires removing a legacy generated image and its metadata together", () => {
    const current = {
      image: "./assets/wiki/generated-portraits/legacy.webp",
      evidence: {
        ...measurements,
        imageArtwork: { kind: "generated", generator: "image_gen" },
        editorialReferences: [reference],
      },
    };
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        evidence: {
          ...measurements,
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
    ).toThrow("Generated images are not accepted");
    expect(() =>
      assertVariantEvidenceUpdate(current, {
        evidence: { ...measurements, editorialReferences: [] },
      }),
    ).toThrow("Generated images are not accepted");
    expect(() =>
      assertVariantEvidenceUpdate(current, { image: null, evidence: { ...measurements } }),
    ).not.toThrow();
    expect(() => assertVariantEvidenceUpdate(current, { image: null })).toThrow("removed together");
  });
  test("keeps legacy edits without evidence compatible and refuses inventing a missing measurement", () => {
    expect(() => assertVariantEvidenceUpdate(before, { summary: "Reviewed text" })).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate({ evidence: null, image: null }, { image: "official.png" }),
    ).toThrow("primary source reference");
    expect(() =>
      assertVariantEvidenceUpdate({ evidence: null, image: null }, { evidence: null }),
    ).not.toThrow();
    expect(() =>
      assertVariantEvidenceUpdate({ evidence: null, image: null }, { evidence: measurements }),
    ).toThrow("Existing complete");
  });
});
