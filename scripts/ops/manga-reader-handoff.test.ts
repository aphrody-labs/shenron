// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handoffDigest as digest, handoffReader } from "./manga-reader-handoff";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
const roots: string[] = [];
afterEach(async () => {
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "manga-handoff-"));
  roots.push(root);
  const pin = async (name: string, value: unknown) => {
    const path = join(root, name),
      body = JSON.stringify(value);
    await Bun.write(path, body);
    return { path, sha256: digest(body) };
  };
  const files = await Promise.all(
    [1, 2].map(async (n) => {
      const path = join(root, `${n}.png`),
        bytes = new TextEncoder().encode(`test-native-image-${n}`);
      await Bun.write(path, bytes);
      return {
        url: `https://publisher.example/vol2/${n}.png`,
        path,
        source_path: path,
        bytes: bytes.length,
        sha256: digest(bytes),
        source_sha256: digest(bytes),
        width: 100,
        height: 150,
      };
    }),
  );
  const pages = files.map((f, i) => ({
    sourceUrl: f.url,
    publicPath: `/assets/manga/SOSH/vol2/${i + 1}.png`,
    sha256: f.sha256,
    size: f.bytes,
    contentType: "image/png",
    kind: "manga",
    printedPages: [i + 1],
  }));
  const documentUrl = "https://publisher.example/book2";
  const input = await pin("input.jsonl", {
    crawl_id: "test-native",
    document_uid: "test2",
    canonical_url: documentUrl,
    source_domain: "publisher.example",
    category: "manga",
    http_status: 200,
    raw_checksum: "a".repeat(64),
    timestamp_utc: "2026-10-15T00:00:00Z",
    payload: {
      title_raw: "総集編 Legend 2",
      body_markdown: "9784081111664",
      embedded_media: pages.map((p) => ({ url: p.sourceUrl, type: "image" })),
    },
  });
  const policy = await pin("policy.json", {
    version: 1,
    profile: "dbfr",
    sources: [
      {
        domain: "publisher.example",
        kind: "publisher",
        reviewed: true,
        evidence: documentUrl,
        rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
      },
    ],
  });
  const media = await pin(
    "media.json",
    pages.map((p) => ({
      url: p.sourceUrl,
      sha256: p.sha256,
      size: p.size,
      contentType: p.contentType,
    })),
  );
  const config = await pin("config.json", {
    version: 1,
    input: input.path,
    policy: policy.path,
    media: media.path,
    job: join(root, "pipeline"),
    store: {},
  });
  const expectedVolume = {
    id: 702,
    series: "SOSH",
    volumeNumber: 2,
    isbn: "9784081111664",
    visible: true,
  };
  const expectedChapter = {
    id: 35002,
    series: "SOSH",
    volumeId: 702,
    chapterNumber: 2,
    pages: [],
    visible: false,
  };
  const bundle = {
    schema: "shenron-manga-publication-bundle/v1",
    series: "SOSH",
    volumeId: 702,
    volumeNumber: 2,
    chapterId: 35002,
    chapterNumber: 2,
    isbn: "9784081111664",
    activate: true,
    expectedVolume,
    expectedVolumeSha256: wikiUpdateSnapshotHash(expectedVolume),
    expectedChapter,
    expectedChapterSha256: wikiUpdateSnapshotHash(expectedChapter),
    pages,
    source: {
      config,
      input,
      policy,
      media,
      documentUrl,
      editionToken: "総集編",
      volumeToken: "Legend 2",
      isbnToken: "9784081111664",
    },
  };
  const manifest = {
    version: 1,
    collection: "SOSH",
    rightsEvidence: "test-fixture-only",
    volumes: [
      {
        volumeId: 702,
        volumeNumber: 2,
        chapterId: 35002,
        title: "Legend 2",
        titleJa: "総集編",
        sourceUrl: documentUrl,
        pageCountEvidence: "https://publisher.example/pagination",
        expectedPages: 2,
        review: "approved",
        pages: pages.map((p, i) => ({
          number: i + 1,
          readerImage: "https://cdn.dragonballfr.com" + p.publicPath,
          sha256: p.sha256,
        })),
      },
    ],
  };
  return {
    root,
    bundle,
    manifest,
    acquisition: { completed: true, pending: 0, errors: [], files },
    nativeRoot: root,
    outbox: join(root, "outbox"),
  };
}
test.skipIf(process.platform === "win32")(
  "verified native assets and approved capture produce exactly one atomic replayable outbox item",
  async () => {
    const f = await fixture();
    const results = await Promise.all([handoffReader(f), handoffReader(f)]);
    expect(results.map((r) => r.replay).toSorted()).toEqual([false, true]);
    expect(await readdir(f.outbox)).toEqual([results[0]!.bundleSha256 + ".json"]);
    expect(results[0]).toMatchObject({
      pagesVerified: 2,
      publicActivation: false,
      editorialMutation: false,
    });
  },
);
test("changed original bytes never enter the outbox", async () => {
  const f = await fixture();
  await Bun.write(f.acquisition.files[0]!.source_path, "corrupt");
  await expect(handoffReader(f)).rejects.toThrow("checksum mismatch");
  expect(await Bun.file(join(f.outbox, "anything.json")).exists()).toBe(false);
});
test("incomplete or ambiguous acquisition cannot acquire an approved label", async () => {
  const f = await fixture();
  f.acquisition.pending = 1;
  await expect(handoffReader(f)).rejects.toThrow("incomplete");
  f.acquisition.pending = 0;
  f.acquisition.files.push(f.acquisition.files[0]!);
  await expect(handoffReader(f)).rejects.toThrow("Ambiguous");
});
test("approved page count and source identity are consumed, never inferred from HTTP200", async () => {
  const f = await fixture();
  f.manifest.volumes[0]!.expectedPages = 3;
  await expect(handoffReader(f)).rejects.toThrow("Incomplete page enumeration");
  f.manifest.volumes[0]!.expectedPages = 2;
  f.manifest.volumes[0]!.sourceUrl = "https://publisher.example/another-book";
  await expect(handoffReader(f)).rejects.toThrow("identity differ");
});
