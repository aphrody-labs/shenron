// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./manga-publication-worker.test";
import {
  planMangaAcquisition,
  nativeMangaPlannerPorts,
  type MangaPlannerPorts,
} from "./manga-acquisition-planner";
import { mangaDigest } from "./manga-cdn-projection";
const image = new Uint8Array(30);
image.set([137, 80, 78, 71, 13, 10, 26, 10]);
test("planner resumes bounded acquisition, resolves fresh identities and emits pinned CAS bundle automatically", async () => {
  const f = await fixture();
  const candidate = {
    schema: "shenron-manga-acquisition-candidate/v1",
    series: f.bundle.series,
    volumeNumber: f.bundle.volumeNumber,
    chapterNumber: f.bundle.chapterNumber,
    isbn: f.bundle.isbn,
    source: { ...f.bundle.source },
    expectedImages: 2,
    pages: f.bundle.pages.map((p) => ({
      sourceUrl: p.sourceUrl,
      kind: p.kind,
      printedPages: p.printedPages,
    })),
  };
  delete (candidate.source as Partial<typeof candidate.source>).media;
  let gets = 0;
  const ports: MangaPlannerPorts = {
    locate: async () => ({ volume: f.bundle.expectedVolume, chapter: f.bundle.expectedChapter }),
    acquire: async (url) => {
      gets++;
      const bytes = image.slice();
      bytes[29] = url.endsWith("1.png") ? 1 : 2;
      return {
        bytes,
        sha256: mangaDigest(bytes),
        status: 200,
        contentType: "image/png",
        finalUrl: url,
      };
    },
  };
  const outbox = join(f.root, "outbox"),
    job = join(f.root, "worker");
  expect(await planMangaAcquisition(candidate, job, outbox, ports, 1)).toMatchObject({
    complete: false,
    reason: "cycle-budget",
  });
  const result = await planMangaAcquisition(candidate, job, outbox, ports, 1);
  expect(result.complete).toBe(true);
  expect(gets).toBe(2);
  if (!result.complete) throw Error("Expected qualified bundle");
  const bundle = await Bun.file(result.output).json();
  expect(bundle.expectedChapterSha256).toBe(f.bundle.expectedChapterSha256);
  expect(bundle.pages).toHaveLength(2);
  expect(bundle.pages[0].publicPath).toContain("/assets/manga/SOSH/vol2/");
  const coverage = await Bun.file(
    join(job, "acquisitions", result.identity, "coverage.json"),
  ).json();
  expect(coverage.status).toBe("partial-until-independent-pagination-audit");
});
test("pool adapter reads only matching acquired receipts and rejects mutated original bytes", async () => {
  const f = await fixture(),
    pool = join(f.root, "pool");
  await mkdir(join(pool, "acquired"), { recursive: true });
  const hash = mangaDigest(image),
    assetPath = join(pool, "acquired", hash);
  await Bun.write(assetPath, image);
  const receipt = join(pool, "receipt.json");
  await Bun.write(
    receipt,
    JSON.stringify({
      assetPath,
      sourceUrl: "https://publisher.example/1.png",
      httpStatus: 200,
      bytes: image.length,
      sha256: hash,
      contentType: "image/png",
      publicationEligible: false,
    }),
  );
  const db = new Database(join(pool, "frontier.sqlite"));
  db.exec("CREATE TABLE pool_tasks(kind TEXT,state TEXT,url TEXT,receipt TEXT)");
  db.query("INSERT INTO pool_tasks VALUES ('acquisition','done',?,?)").run(
    "https://publisher.example/1.png",
    receipt,
  );
  db.close();
  const ports = nativeMangaPlannerPorts(undefined, pool);
  expect(
    (await ports.acquire("https://publisher.example/1.png", ["https://publisher.example"], 100))
      .sha256,
  ).toBe(hash);
  await Bun.write(assetPath, "changed");
  await expect(
    ports.acquire("https://publisher.example/1.png", ["https://publisher.example"], 100),
  ).rejects.toThrow("bytes differ");
  await expect(
    ports.acquire("https://publisher.example/absent.png", ["https://publisher.example"], 100),
  ).rejects.toThrow("no acquired bytes");
});
