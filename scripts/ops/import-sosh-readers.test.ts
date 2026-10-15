// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  validateSoshReaderManifest,
  verifySoshReaderAssets,
  missingSoshChapters,
  soshSnapshotDigest,
} from "./import-sosh-readers";
import { archiveDigest } from "./apply-archive-catalog";

const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const fixture = () => ({
  version: 1,
  collection: "SOSH",
  rightsEvidence: "Private owner license scope reviewed",
  volumes: [
    {
      volumeId: 702,
      volumeNumber: 2,
      chapterId: 35002,
      title: "Legend 2",
      titleJa: "超悟空伝 Legend 2",
      sourceUrl: "https://www.shueisha.co.jp/books/legend2",
      pageCountEvidence: "https://www.shueisha.co.jp/books/legend2",
      expectedPages: 2,
      review: "approved",
      pages: [0, 7].map((number) => ({
        number,
        readerImage: `https://dragonballfr.com/assets/manga/SOSH/vol2/${number}.jpg`,
        sha256: archiveDigest(image),
      })),
    },
  ],
});
const baseline = () => ({
  volumes: [{ id: 702, series: "SOSH", volume_number: 2, visible: true }],
  chapters: [] as Record<string, unknown>[],
});

test("one verified volume is a valid partial batch, preserving scan numbering", () => {
  const manifest = validateSoshReaderManifest(fixture());
  expect(manifest.volumes).toHaveLength(1);
  expect(manifest.volumes[0]!.pages.map((page) => page.number)).toEqual([0, 7]);
  expect(missingSoshChapters(manifest, baseline())).toHaveLength(1);
});

test("rejects fabricated counts, mismatched volume identities, duplicate chapters and unordered pages", () => {
  for (const mutate of [
    (value: ReturnType<typeof fixture>) => {
      value.volumes[0]!.expectedPages = 381;
    },
    (value: ReturnType<typeof fixture>) => {
      value.volumes[0]!.volumeId = 703;
    },
    (value: ReturnType<typeof fixture>) => {
      value.volumes.push(structuredClone(value.volumes[0]!));
    },
    (value: ReturnType<typeof fixture>) => {
      value.volumes[0]!.pages.reverse();
    },
    (value: ReturnType<typeof fixture>) => {
      value.volumes[0]!.pages[1]!.readerImage = value.volumes[0]!.pages[0]!.readerImage;
    },
  ]) {
    const input = fixture();
    mutate(input);
    expect(() => validateSoshReaderManifest(input)).toThrow();
  }
});

test("rejects unreviewed sources, external image providers and unknown fields", () => {
  const external = fixture();
  external.volumes[0]!.pages[0]!.readerImage = "https://example.com/scan.jpg";
  expect(() => validateSoshReaderManifest(external)).toThrow();
  const source = fixture();
  source.volumes[0]!.sourceUrl = "https://dragonball.fandom.com/wiki/Source";
  expect(() => validateSoshReaderManifest(source)).toThrow();
  expect(() => validateSoshReaderManifest({ ...fixture(), apply: true })).toThrow();
});

test("every actual public image must match its pinned bytes", async () => {
  const manifest = validateSoshReaderManifest(fixture());
  const fetcher = (async (_url: unknown, options: RequestInit) => {
    expect(options.redirect).toBe("error");
    return new Response(image, { headers: { "content-type": "image/jpeg" } });
  }) as unknown as typeof fetch;
  expect(await verifySoshReaderAssets(manifest, fetcher)).toBe(2);
  await expect(
    verifySoshReaderAssets(
      manifest,
      (async () =>
        new Response("other", {
          headers: { "content-type": "image/jpeg" },
        })) as unknown as typeof fetch,
    ),
  ).rejects.toThrow("digest");
  await expect(
    verifySoshReaderAssets(
      manifest,
      (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch,
    ),
  ).rejects.toThrow("unavailable");
  await expect(
    verifySoshReaderAssets(
      manifest,
      (async () =>
        new Response("html", {
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
    ),
  ).rejects.toThrow("unavailable");
});

test("exact replay has no inserts and protects existing chapters, visibility and ID collisions", () => {
  const manifest = validateSoshReaderManifest(fixture());
  const volume = manifest.volumes[0]!;
  const state = baseline();
  state.chapters.push({
    id: volume.chapterId,
    series: "SOSH",
    chapter_number: 2,
    volume_id: 702,
    title: volume.title,
    title_ja: volume.titleJa,
    cover: volume.pages[0]!.readerImage,
    pages: volume.pages.map((page) => page.readerImage),
    visible: true,
  });
  expect(missingSoshChapters(manifest, state)).toEqual([]);
  for (const override of [
    { pages: [] },
    { visible: false },
    { series: "DB" },
    { volume_id: 701 },
    { title: "Concurrent edit" },
  ]) {
    const changed = structuredClone(state);
    Object.assign(changed.chapters[0]!, override);
    expect(() => missingSoshChapters(manifest, changed)).toThrow();
    expect(soshSnapshotDigest(changed)).not.toBe(soshSnapshotDigest(state));
  }
  const hidden = baseline();
  hidden.volumes[0]!.visible = false;
  expect(() => missingSoshChapters(manifest, hidden)).toThrow();
  const duplicate = structuredClone(state);
  duplicate.chapters.push({ ...duplicate.chapters[0], id: 35003 });
  expect(() => missingSoshChapters(manifest, duplicate)).toThrow();
});

test("publishing an existing empty hidden stub requires explicit opt-in and exact identity", () => {
  const manifest = validateSoshReaderManifest(fixture());
  const state = baseline();
  state.chapters.push({
    id: 35002,
    volume_id: 702,
    series: "SOSH",
    chapter_number: 2,
    visible: false,
    pages: [],
    title: "Pending",
    editorial_note: "Keep this note",
  });
  const original = structuredClone(state);
  expect(() => missingSoshChapters(manifest, state)).toThrow("protected");
  expect(missingSoshChapters(manifest, state, { publishEmptyHidden: true })).toEqual(
    manifest.volumes,
  );
  expect(state).toEqual(original);
  for (const override of [
    { visible: true },
    { pages: null },
    { pages: ["existing scan"] },
    { series: "DB" },
    { volume_id: 703 },
    { chapter_number: 3 },
    { id: 35003 },
  ]) {
    const changed = structuredClone(state);
    Object.assign(changed.chapters[0]!, override);
    expect(() => missingSoshChapters(manifest, changed, { publishEmptyHidden: true })).toThrow();
  }
});
