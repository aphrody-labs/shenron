// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MangaPublicationQueue,
  qualifyBundle,
  consumeMangaBundle,
  runMangaWorker,
  type WorkerConfig,
  type MangaBundle,
  type MangaWorkerPorts,
} from "./manga-publication-worker";
import { mangaDigest } from "./manga-cdn-projection";
import { wikiUpdateSnapshotHash as hash } from "../../apps/site/src/lib/wiki-update-precondition";
const roots: string[] = [];
afterEach(async () => {
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "manga-consumer-"));
  roots.push(root);
  const pin = async (name: string, body: string) => {
    const path = join(root, name);
    await Bun.write(path, body);
    return { path, sha256: mangaDigest(body) };
  };
  const pages = [1, 2].map((n) => ({
    sourceUrl: `https://publisher.example/vol2/${n}.png`,
    publicPath: `/assets/manga/SOSH/vol2/${n}.png`,
    sha256: "a".repeat(64),
    size: 123,
    contentType: "image/png" as const,
    kind: "manga" as const,
    printedPages: [n],
  }));
  const input = await pin(
    "input.jsonl",
    JSON.stringify({
      crawl_id: "native",
      document_uid: "book2",
      canonical_url: "https://publisher.example/book2",
      source_domain: "publisher.example",
      category: "manga",
      http_status: 200,
      raw_checksum: "b".repeat(64),
      timestamp_utc: "2026-10-15T00:00:00Z",
      payload: {
        title_raw: "総集編 Legend 2",
        body_markdown: "9784081111664",
        embedded_media: pages.map((p) => ({ url: p.sourceUrl, type: "image" })),
      },
    }) + "\n",
  );
  const policy = await pin(
    "policy.json",
    JSON.stringify({
      version: 1,
      profile: "dbfr",
      sources: [
        {
          domain: "publisher.example",
          kind: "publisher",
          reviewed: true,
          evidence: "https://publisher.example/book2",
          rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
        },
      ],
    }),
  );
  const media = await pin(
    "media.json",
    JSON.stringify(
      pages.map((p) => ({
        url: p.sourceUrl,
        sha256: p.sha256,
        size: p.size,
        contentType: p.contentType,
      })),
    ),
  );
  const config = await pin(
    "config.json",
    JSON.stringify({
      version: 1,
      input: input.path,
      policy: policy.path,
      media: media.path,
      job: join(root, "source"),
      store: {},
    }),
  );
  const expectedVolume = {
    id: 702,
    series: "SOSH",
    volumeNumber: 2,
    isbn: "978-4-08-111166-4",
    visible: true,
  };
  const expectedChapter = {
    id: 35002,
    series: "SOSH",
    volumeId: 702,
    chapterNumber: 2,
    title: "Legend 2",
    pages: [],
    visible: false,
  };
  const bundle: MangaBundle = {
    schema: "shenron-manga-publication-bundle/v1",
    series: "SOSH",
    volumeId: 702,
    volumeNumber: 2,
    chapterId: 35002,
    chapterNumber: 2,
    isbn: "9784081111664",
    activate: true,
    expectedVolume,
    expectedVolumeSha256: hash(expectedVolume),
    expectedChapter,
    expectedChapterSha256: hash(expectedChapter),
    source: {
      config,
      input,
      policy,
      media,
      documentUrl: "https://publisher.example/book2",
      editionToken: "総集編",
      volumeToken: "Legend 2",
      isbnToken: "9784081111664",
    },
    pages,
  };
  let current: Record<string, unknown> = structuredClone(expectedChapter),
    patches = 0,
    publications = 0;
  const resumes: boolean[] = [];
  const ports: MangaWorkerPorts = {
    source: async () => ({ complete: true, publicActivation: false, revision: root }),
    read: async (table) => (table === "db_manga_volumes" ? expectedVolume : current),
    patch: async (_id, body) => {
      expect(body.expectedSha256).toBe(hash(current));
      current = {
        ...current,
        pages: body.pages,
        visible: body.visible,
        ...(body.readerExtent ? { readerExtent: body.readerExtent } : {}),
      };
      patches++;
    },
    revision: async () => true,
    publish: async (_b, _j, resume) => {
      resumes.push(resume);
      publications++;
      return { complete: true };
    },
    replica: async () => {},
    verify: async () => {
      expect(current.visible).toBe(true);
    },
  };
  return {
    root,
    bundle,
    ports,
    patches: () => patches,
    publications: () => publications,
    resumes,
    setCurrent: (row: Record<string, unknown>) => {
      current = row;
    },
  };
}
test("native edition/ISBN/embedded images are required and source file mutations fail closed", async () => {
  const f = await fixture();
  expect((await qualifyBundle(f.bundle)).pages).toHaveLength(2);
  const cover = structuredClone(f.bundle);
  cover.pages = cover.pages.map((p) => ({ ...p, kind: "cover" }));
  await expect(qualifyBundle(cover)).rejects.toThrow("Cover-only");
  const foreign = structuredClone(f.bundle);
  foreign.pages[0]!.sourceUrl = "https://dragonball.fandom.com/page.png";
  await expect(qualifyBundle(foreign)).rejects.toThrow();
  await Bun.write(f.bundle.source.input.path, "changed");
  await expect(qualifyBundle(f.bundle)).rejects.toThrow("Pinned input changed");
});
test("publication traverses canonical CAS, complete backup, readback, replica and reader then deduplicates", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  const id = q.enqueue(f.bundle);
  expect(q.enqueue(f.bundle)).toBe(id);
  await consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports);
  expect(f.patches()).toBe(1);
  expect(f.publications()).toBe(1);
  expect(q.next()).toBeNull();
  expect(await Bun.file(join(f.root, id, "before.json")).json()).toEqual([
    f.bundle.expectedVolume,
    f.bundle.expectedChapter,
  ]);
  db.close();
});
test("lost public acknowledgement resumes its existing owner and never repeats the canonical edit", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db),
    id = q.enqueue(f.bundle);
  const publish = f.ports.publish;
  f.ports.publish = async (...args) => {
    await publish(...args);
    throw Error("observation interrupted");
  };
  await expect(consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports)).rejects.toThrow();
  f.ports.publish = publish;
  await consumeMangaBundle(q, q.next()!, join(f.root, id), f.ports);
  expect(f.resumes).toEqual([false, true]);
  expect(f.patches()).toBe(1);
  expect(q.next()).toBeNull();
  db.close();
});
test("concurrent editorial changes quarantine the task without overwriting the row", async () => {
  const f = await fixture(),
    db = new Database(":memory:"),
    q = new MangaPublicationQueue(db),
    id = q.enqueue(f.bundle);
  f.setCurrent({ ...f.bundle.expectedChapter, title: "staff edit" });
  const task = q.next()!;
  try {
    await consumeMangaBundle(q, task, join(f.root, id), f.ports);
  } catch (error) {
    q.fail(task, error);
  }
  expect(f.patches()).toBe(0);
  expect(f.publications()).toBe(0);
  expect(q.next()).toBeNull();
  expect(q.rows()[0]).toMatchObject({ phase: "conflict", error: "CAS_CONFLICT" });
  db.close();
});

test("one bounded worker cycle quarantines malformed inputs and completes an independent qualified lot", async () => {
  const f = await fixture(),
    outbox = join(f.root, "outbox"),
    job = join(f.root, "job");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(outbox, { mode: 0o700 });
  await Bun.write(join(outbox, "bad.json"), "{}");
  await Bun.write(join(outbox, "good.json"), JSON.stringify(f.bundle));
  const config = {
    version: 1,
    job,
    outbox,
    allowedSeries: ["SOSH"],
    replica: { kind: "local", hostname: "unused" },
    publication: { targetUrl: "https://dragonballfr.com/publications/manga-catalogue" },
  } as WorkerConfig;
  await runMangaWorker(config, f.ports, true);
  const status = await Bun.file(join(job, "status.json")).json();
  expect(status.tasks[0].phase).toBe("complete");
  expect(status.completeCatalogue).toBe(false);
  expect(f.patches()).toBe(1);
});

test("explicit preview survives canonical editorial CAS without claiming complete pagination", async () => {
  const f = await fixture();
  f.bundle.publicationExtent = {
    kind: "preview",
    sourceUrl: f.bundle.source.documentUrl,
    fullVolumePages: null,
  };
  const db = new Database(":memory:"),
    q = new MangaPublicationQueue(db);
  q.enqueue(f.bundle);
  await consumeMangaBundle(q, q.next()!, join(f.root, "preview"), f.ports);
  expect(await f.ports.read("db_manga_chapters", f.bundle.chapterId)).toMatchObject({
    readerExtent: f.bundle.publicationExtent,
  });
  expect(q.next()).toBeNull();
  db.close();
});
