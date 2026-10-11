// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { auditCatalog, digest, verifySource, type SourceManifest } from "./source-coverage";
import { ingestSource, type IngestionPorts } from "./source-ingestion";
import {
  databooksFrozen,
  mangaLocator,
  mergeDatabookPages,
  verifyReaderAsset,
} from "./source-ingestion-postgres";

const roots: string[] = [];
test("empty reviewed enumeration remains incomplete", () => {
  const report = auditCatalog(
    {
      version: 1,
      asOf: "2026-10-07",
      families: [
        {
          family: "full_color",
          expectedIds: [],
          enumerationReviewed: true,
          enumerationEvidence: "https://www.shueisha.co.jp/",
        },
      ],
    },
    [],
    "2026-10-07",
  );
  expect(report.complete).toBe(false);
  expect(report.issues).toContain("empty-enumeration:full_color");
});
test("freeze reads doctrine, fails closed, and applies only to databook writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "shenron-doctrine-"));
  roots.push(root);
  expect(await databooksFrozen(root)).toBe(true);
  await mkdir(join(root, "docs/reference/root"), { recursive: true });
  const plan = join(root, "docs/reference/root/PLAN.md");
  await writeFile(plan, '```json\n{"freeze":{"databooks":true}}\n```');
  expect(await databooksFrozen(root)).toBe(true);
  await writeFile(plan, '```json\n{"freeze":{"databooks":false}}\n```');
  expect(await databooksFrozen(root)).toBe(false);
  await mkdir(join(root, ".coord"), { recursive: true });
  await writeFile(join(root, ".coord/FREEZE-databooks.json"), "unreadable state");
  expect(await databooksFrozen(root)).toBe(true);
});
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shenron-source-"));
  roots.push(root);
  await writeFile(join(root, "page.jpg"), "image");
  const source: SourceManifest = {
    version: 1,
    family: "soshuhen",
    id: "soshuhen_01",
    title: "Soshuhen 1",
    edition: { publisher: "Shueisha", format: "print", language: "ja", identifier: "volume-1" },
    citation: "https://dragonballfr.com/wiki/manga",
    expectedPages: 1,
    pageCountEvidence: "https://www.shueisha.co.jp/",
    rights: {
      basis: "owned",
      evidence: "private receipt",
      ragPermitted: true,
      publicImagesPermitted: false,
    },
    pages: [
      {
        number: 1,
        asset: "page.jpg",
        sha256: digest("image"),
        review: "approved",
        text: "孫悟空",
        noText: false,
        lang: "ja",
      },
    ],
  };
  return { root, source };
}
test("databook merge preserves OCR objects and refuses image or transcription conflicts", async () => {
  const { source } = await fixture();
  source.pages[0]!.readerImage = "/assets/page.jpg";
  const pages = [
    {
      number: 1,
      image: "/assets/page.jpg",
      text: { kind: "text", markdown: "", model: "original" },
      text_fr: "preserved",
    },
  ];
  const merged = mergeDatabookPages(pages, source, "manifest-digest");
  expect(merged[0]!.text).toEqual({ kind: "text", markdown: "孫悟空", model: "original" });
  expect(merged[0]!.text_fr).toBe("preserved");
  expect(pages[0]!.text.markdown).toBe("");
  expect(() =>
    mergeDatabookPages([{ ...pages[0]!, image: "/assets/old.jpg" }], source, "digest"),
  ).toThrow("image identity");
  expect(() =>
    mergeDatabookPages([{ ...pages[0]!, text: { markdown: "different" } }], source, "digest"),
  ).toThrow("conflict");
});
test("reader bytes must match the approved source SHA and external hosts are refused", async () => {
  const fetcher: typeof fetch = Object.assign(
    async () => new Response("image", { headers: { "content-type": "image/jpeg" } }),
    { preconnect: fetch.preconnect },
  );
  expect(await verifyReaderAsset("/assets/page.jpg", digest("image"), fetcher)).toBe(true);
  expect(await verifyReaderAsset("/assets/page.jpg", digest("changed"), fetcher)).toBe(false);
  expect(await verifyReaderAsset("https://127.0.0.1/private", digest("image"), fetcher)).toBe(
    false,
  );
});
test("manga reader mapping binds edition, chapter, visible slot and filename pagination", async () => {
  const { source } = await fixture();
  source.databaseTarget = { table: "db_manga_volumes", id: 71 };
  const page = {
    ...source.pages[0]!,
    readerImage: "/assets/001.jpg",
    mangaReader: { chapterId: 91, pageIndex: 1, planche: 1 },
  };
  const chapter = {
    id: 91,
    series: "DB_FULL_COLOR",
    chapter_number: 1,
    volume_id: 71,
    visible: true,
    pages: ["/assets/001.jpg"],
  };
  expect(mangaLocator(source, page, chapter)).toEqual({
    series: "DB_FULL_COLOR",
    tome: "ch91",
    planche: 1,
    chapterId: 91,
    pageIndex: 1,
  });
  expect(() => mangaLocator(source, page, { ...chapter, volume_id: 72 })).toThrow(
    "mapping mismatch",
  );
  expect(() => mangaLocator(source, page, { ...chapter, pages: ["/assets/old.jpg"] })).toThrow(
    "mapping mismatch",
  );
  expect(() =>
    mangaLocator(source, { ...page, mangaReader: { ...page.mangaReader, planche: 2 } }, chapter),
  ).toThrow("identity mismatch");
});
test("actual files, hashes, exact pagination and review are required", async () => {
  const { root, source } = await fixture();
  expect((await verifySource(source, root)).ready).toBe(true);
  source.expectedPages = 2;
  source.pages[0]!.sha256 = digest("wrong");
  source.pages[0]!.review = "pending";
  expect((await verifySource(source, root)).issues).toEqual(["review:1", "hash:1", "missing:2"]);
});
test("symlink outside private corpus cannot be ingested", async () => {
  const { root, source } = await fixture();
  await symlink(join(root, "page.jpg"), join(root, "link.jpg"), "file");
  source.pages[0]!.asset = "../" + basename(root) + "/link.jpg";
  expect((await verifySource(source, root)).ready).toBe(true);
  source.pages[0]!.asset = "../../etc/passwd";
  expect((await verifySource(source, root)).issues).toContain("asset:1");
});
test("textless pages are explicit and duplicate pages never cover gaps", async () => {
  const { root, source } = await fixture();
  source.pages[0]!.noText = true;
  expect((await verifySource(source, root)).issues).toContain("text:1");
  source.pages[0]!.text = "";
  expect((await verifySource(source, root)).ready).toBe(true);
  source.pages.push({ ...source.pages[0]! });
  expect((await verifySource(source, root)).issues).toContain("duplicate:1");
});
test("unknown WSJ and interview enumeration cannot report complete", () => {
  const report = auditCatalog({ version: 1, asOf: "2026-10-07", families: [] }, []);
  expect(report.complete).toBe(false);
  expect(report.issues).toContain("enumeration:interview");
  expect(report.issues).toContain("enumeration:weekly_shonen_jump");
});
test("resume rechecks live evidence and refuses writes during freeze", async () => {
  const { root, source } = await fixture();
  const calls: string[] = [];
  let database = false;
  let rag = false;
  const ports: IngestionPorts = {
    deposit: async () => {
      calls.push("deposit");
      database = true;
    },
    verifyDatabase: async () => database,
    syncRag: async () => {
      calls.push("sync");
      rag = true;
    },
    verifyRag: async () => rag,
    checkpoint: async (stage) => {
      calls.push(stage);
    },
  };
  await expect(
    ingestSource(source, root, ports, { apply: true, editorialFrozen: true }),
  ).rejects.toThrow("freeze");
  expect(calls).toEqual([]);
  expect(
    (await ingestSource(source, root, ports, { apply: true, editorialFrozen: false })).complete,
  ).toBe(true);
  calls.length = 0;
  rag = false;
  await ingestSource(source, root, ports, { apply: true, editorialFrozen: false });
  expect(calls).toEqual(["database", "sync", "rag"]);
});
