// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  applyReviewedVariantEdits,
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
            kind: "scan",
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
      entries: [{ ...item, sources: [{ ...item.sources[0], url: "https://google.com/claim" }] }],
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

test("accepts reviewed display bounds without rewriting measured evidence and rejects reversed volumes", () => {
  const manifest = fixture();
  const item = manifest.entries[0]!;
  const reviewed = {
    ...item,
    expected: { ...item.expected, firstVolume: 24, lastVolume: 28 },
    patch: { lastVolume: 27 },
  };
  reviewed.expectedSha256 = wikiUpdateSnapshotHash(reviewed.expected);
  expect(
    validateReviewedVariantManifest({ version: 1, entries: [reviewed] }).entries[0]!.patch,
  ).toEqual({ lastVolume: 27 });
  expect(() =>
    validateReviewedVariantManifest({
      version: 1,
      entries: [{ ...reviewed, patch: { lastVolume: 0 } }],
    }),
  ).toThrow("lastVolume");
  expect(() =>
    validateReviewedVariantManifest({
      version: 1,
      entries: [{ ...reviewed, patch: { lastVolume: 23 } }],
    }),
  ).toThrow("Reversed");
});

test("checks the complete batch before any write and preserves a receipt on readback failure", async () => {
  const manifest = fixture();
  const item = manifest.entries[0]!;
  item.sources[0]!.file = import.meta.filename;
  item.sources[0]!.sha256 = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(import.meta.filename).bytes())
    .digest("hex");
  const receipt = `../../var/reports/test-reviewed-writer-${crypto.randomUUID()}.json`;
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  let written = false;
  const fake = async (_input: string | URL | Request, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "PATCH") {
      written = true;
      return Response.json({ ok: true });
    }
    // Simulate a writer silently discarding a field after a successful HTTP status.
    return Response.json(
      written ? { ...item.expected, summary: "Unexpected concurrent text" } : item.expected,
    );
  };
  globalThis.fetch = Object.assign(fake, { preconnect: originalFetch.preconnect }) as typeof fetch;
  try {
    await expect(
      applyReviewedVariantEdits(manifest, { apply: true, token: "test-only", receipt }),
    ).rejects.toThrow("Complete readback mismatch");
    expect(methods).toEqual(["GET", "PATCH", "GET"]);
    const saved = await Bun.file(receipt).json();
    expect(saved.entries[0].after.summary).toBe("Unexpected concurrent text");
    expect(JSON.stringify(saved)).not.toContain("test-only");
    await expect(
      applyReviewedVariantEdits(manifest, { apply: true, token: "test-only", receipt }),
    ).rejects.toThrow("new receipt path");
  } finally {
    globalThis.fetch = originalFetch;
    if (await Bun.file(receipt).exists()) await Bun.file(receipt).delete();
  }
});

test("drift in a later entry prevents all writes", async () => {
  const manifest = fixture();
  const item = manifest.entries[0]!;
  item.sources[0]!.file = import.meta.filename;
  item.sources[0]!.sha256 = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(import.meta.filename).bytes())
    .digest("hex");
  const next = structuredClone(item);
  next.id = 2450;
  next.expected.id = 2450;
  next.expectedSha256 = wikiUpdateSnapshotHash(next.expected);
  manifest.entries.push(next);
  const receipt = `../../var/reports/test-reviewed-writer-${crypto.randomUUID()}.json`;
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    return Response.json(
      String(input).endsWith("2449")
        ? item.expected
        : { ...next.expected, summary: "New editorial correction" },
    );
  };
  globalThis.fetch = Object.assign(fake, { preconnect: originalFetch.preconnect }) as typeof fetch;
  try {
    await expect(
      applyReviewedVariantEdits(manifest, { apply: true, token: "test-only", receipt }),
    ).rejects.toThrow("Snapshot drift");
    expect(methods).toEqual(["GET", "GET"]);
    expect(await Bun.file(receipt).exists()).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    if (await Bun.file(receipt).exists()) await Bun.file(receipt).delete();
  }
});
