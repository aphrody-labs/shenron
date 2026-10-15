// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import {
  prepareMangaEditorial,
  applyMangaEditorial,
  verifyMangaEditorial,
} from "./manga-publication-editor";
import { readerWikiRow, type SoshAssetFetcher } from "./import-sosh-readers";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import type { MangaBundle } from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";

const url = process.env.SOSH_IMPORT_PG_URL;
const target = url ? new URL(url) : null;
if (
  target &&
  (!["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/shenron_sosh_fixture")
)
  throw Error("Editorial tests require the isolated loopback fixture database");
test.skipIf(!url)(
  "canonical adapter creates absent chapter, publishes empty stub, recovers SQL acknowledgement and preserves CAS",
  async () => {
    const sql = postgres(url!, { max: 1, prepare: false }),
      root = await mkdtemp(join(tmpdir(), "manga-editorial-"));
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const digest = (value: string | Uint8Array) =>
      new Bun.CryptoHasher("sha256").update(value).digest("hex");
    let available = false;
    const fetcher: SoshAssetFetcher = async () =>
      available
        ? new Response(image, { headers: { "content-type": "image/jpeg" } })
        : new Response("not uploaded", { status: 404 });
    const backup = async (job: string) => {
      const dump = Bun.spawn(
        [
          "docker",
          "exec",
          process.env.SOSH_IMPORT_PG_CONTAINER ?? "shenron-sosh-import-fixture",
          "pg_dump",
          "-U",
          "fixture",
          "-p",
          target!.port,
          "-Fc",
          "shenron_sosh_fixture",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const bytes = await new Response(dump.stdout).bytes();
      if (await dump.exited) throw Error(await new Response(dump.stderr).text());
      const inventory = Bun.spawn(
        [
          "docker",
          "exec",
          "-i",
          process.env.SOSH_IMPORT_PG_CONTAINER ?? "shenron-sosh-import-fixture",
          "pg_restore",
          "--list",
        ],
        { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
      );
      inventory.stdin.write(bytes);
      inventory.stdin.end();
      const listing = await new Response(inventory.stdout).text();
      if ((await inventory.exited) || !listing.includes("TABLE DATA bot db_manga_chapters"))
        throw Error("Fixture backup inventory failed");
      await Bun.write(join(job, "catalog-before.dump"), bytes);
      await Bun.write(
        join(job, "backup.json"),
        JSON.stringify({ inventoryVerified: true, sha256: digest(bytes) }),
      );
    };
    const options = { databaseUrl: url, backup, fetcher };
    const bundle = async (volumeId: number, chapterId: number | null): Promise<MangaBundle> => {
      const [volume] = await sql`SELECT * FROM bot.db_manga_volumes WHERE id=${volumeId}`;
      const rows = await sql`SELECT * FROM bot.db_manga_chapters WHERE volume_id=${volumeId}`;
      const v = readerWikiRow(volume!),
        c = rows[0] ? readerWikiRow(rows[0]) : null;
      const pin = { path: join(root, "source-pin"), sha256: "a".repeat(64) };
      return {
        schema: "shenron-manga-publication-bundle/v1",
        series: String(v.series),
        volumeId,
        volumeNumber: Number(v.volumeNumber),
        chapterId,
        chapterNumber: chapterId ? 2 : 1,
        isbn: String(v.isbn),
        activate: true,
        expectedVolume: v,
        expectedVolumeSha256: wikiUpdateSnapshotHash(v),
        expectedChapter: c,
        expectedChapterSha256: c ? wikiUpdateSnapshotHash(c) : null,
        source: {
          config: pin,
          input: pin,
          policy: pin,
          media: pin,
          documentUrl: "https://publisher.example/observed-reader",
          editionToken: "reviewed edition",
          volumeToken: "reviewed volume",
          isbnToken: String(v.isbn),
        },
        pages: [1, 2].map((number) => ({
          sourceUrl: `https://publisher.example/${volumeId}/${number}.jpg`,
          publicPath: `/assets/manga/${v.series}/${volumeId}/${number}.jpg`,
          sha256: digest(image),
          size: image.length,
          contentType: "image/jpeg",
          kind: "manga",
          printedPages: null,
        })),
      };
    };
    try {
      await sql`CREATE SCHEMA IF NOT EXISTS bot`;
      await sql`CREATE TABLE bot.db_manga_volumes (id integer PRIMARY KEY,series text,volume_number integer,visible boolean,title text,title_ja text,isbn text)`;
      await sql`CREATE TABLE bot.db_manga_chapters (id integer PRIMARY KEY,series text,chapter_number integer,volume_id integer REFERENCES bot.db_manga_volumes(id),title text,title_ja text,cover text,pages jsonb,visible boolean,editorial_note text)`;
      await sql`CREATE TABLE public.wiki_revisions (id text PRIMARY KEY,"tableName" text,"rowId" text,action text,label text,before jsonb,after jsonb,"editorName" text)`;
      await sql`INSERT INTO bot.db_manga_volumes VALUES (740,'ARALE',1,true,'Docteur Slump perfect edition - Tome 01',null,'9782723472272'),(702,'SOSH',2,true,'Legend 2','超悟空伝 Legend 2','9784081111664')`;
      const b = await bundle(740, null),
        job = join(root, "create");
      const prepared = await prepareMangaEditorial(b, job, options);
      expect(await sql`SELECT id FROM bot.db_manga_chapters`).toHaveLength(0);
      // Resume after the plan/backup survived, but the preparation acknowledgement did not.
      await unlink(join(job, "prepared.json"));
      expect(await prepareMangaEditorial(b, job, options)).toEqual(prepared);
      await expect(applyMangaEditorial(prepared, options)).rejects.toThrow("unavailable");
      expect(await sql`SELECT id FROM bot.db_manga_chapters`).toHaveLength(0);
      available = true;
      const result = await applyMangaEditorial(prepared, options);
      expect(result.chapter.id).toBe(1);
      expect(result.chapter.visible).toBe(true);
      expect(result.chapter.pages).toEqual(
        b.pages.map((page) => "https://cdn.dragonballfr.com" + page.publicPath),
      );
      await unlink(join(job, "receipt.json"));
      await unlink(join(job, "after.json"));
      expect((await applyMangaEditorial(prepared, options)).chapter).toEqual(result.chapter);
      expect((await verifyMangaEditorial(prepared, options)).chapter).toEqual(result.chapter);
      expect(await sql`SELECT id FROM public.wiki_revisions`).toHaveLength(1);
      await sql`INSERT INTO bot.db_manga_chapters VALUES (35002,'SOSH',2,702,'Pending','超悟空伝 Legend 2',null,'[]'::jsonb,false,'Preserve owner note')`;
      const stub = await prepareMangaEditorial(
        await bundle(702, 35002),
        join(root, "stub"),
        options,
      );
      const filled = await applyMangaEditorial(stub, options);
      expect(filled.chapter.id).toBe(35002);
      expect(filled.chapter.visible).toBe(true);
      expect(filled.chapter.editorialNote).toBe("Preserve owner note");
      const [revision] = await sql`SELECT * FROM public.wiki_revisions WHERE "rowId"='35002'`;
      expect(revision!.before.visible).toBe(false);
      expect(revision!.after.pages).toEqual(filled.chapter.pages);
      await sql`UPDATE bot.db_manga_chapters SET editorial_note='Later staff edit' WHERE id=35002`;
      await expect(verifyMangaEditorial(stub, options)).rejects.toThrow("replay");
    } finally {
      await sql`DROP TABLE IF EXISTS public.wiki_revisions,bot.db_manga_chapters,bot.db_manga_volumes`;
      await sql.end({ timeout: 5 });
      await rm(root, { recursive: true, force: true });
    }
  },
  30000,
);
