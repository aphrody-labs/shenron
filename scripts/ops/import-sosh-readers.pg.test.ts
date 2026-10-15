// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { importSoshReaders, type SoshAssetFetcher } from "./import-sosh-readers";
import { importMangaReaders } from "./import-manga-readers";
import {
  prepareMangaEditorial,
  applyMangaEditorial,
  verifyMangaEditorial,
  mangaEditorialRow,
} from "./manga-publication-editor";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import type { MangaBundle } from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
import { archiveDigest } from "./apply-archive-catalog";

const url = process.env.SOSH_IMPORT_PG_URL;
const fixture = url ? new URL(url) : null;
if (
  fixture &&
  (!["127.0.0.1", "localhost"].includes(fixture.hostname) ||
    fixture.pathname !== "/shenron_sosh_fixture")
)
  throw new Error("SOSH tests require the isolated local fixture database");

test.skipIf(!url)(
  "PostgreSQL importer: real JSON arrays, revisions, optimistic conflicts, replay and rollback",
  async () => {
    const sql = postgres(url!, { max: 1, prepare: false });
    const jobs: string[] = [];
    const oldUrl = process.env.DATABASE_URL;
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetcher: SoshAssetFetcher = async () =>
      new Response(image, { headers: { "content-type": "image/jpeg" } });
    const manifest = (number: number, id: number) => ({
      version: 1,
      collection: "SOSH",
      rightsEvidence: "Fixture license evidence",
      volumes: [
        {
          volumeId: 700 + number,
          volumeNumber: number,
          chapterId: id,
          title: `Legend ${number}`,
          titleJa: `超悟空伝 ${number}`,
          sourceUrl: "https://www.shueisha.co.jp/books/",
          pageCountEvidence: "https://www.shueisha.co.jp/books/",
          expectedPages: 2,
          review: "approved",
          pages: [0, 1].map((page) => ({
            number: page,
            readerImage: `https://dragonballfr.com/assets/manga/SOSH/vol${number}/${page}.jpg`,
            sha256: archiveDigest(image),
          })),
        },
      ],
    });
    async function job(number: number, id: number, extra: string[] = [], custom?: unknown) {
      const directory = await mkdtemp(join(tmpdir(), "sosh-import-pg-"));
      jobs.push(directory);
      await chmod(directory, 0o700);
      const body = JSON.stringify(custom ?? manifest(number, id));
      await Bun.write(join(directory, "manifest.json"), body);
      const args = ["--job", directory, "--expected-sha", archiveDigest(body), ...extra];
      await (custom ? importMangaReaders : importSoshReaders)(args, fetcher);
      // A real pg_dump archive qualifies the backup bytes independently from the plan.
      const process = Bun.spawn(
        [
          "docker",
          "exec",
          "shenron-sosh-import-fixture",
          "pg_dump",
          "-U",
          "fixture",
          "-p",
          fixture!.port,
          "-Fc",
          "shenron_sosh_fixture",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const backup = new Uint8Array(await new Response(process.stdout).arrayBuffer());
      if (await process.exited) throw new Error(await new Response(process.stderr).text());
      await Bun.write(join(directory, "catalog-before.dump"), backup);
      await Bun.write(
        join(directory, "backup.json"),
        JSON.stringify({ inventoryVerified: true, sha256: archiveDigest(backup) }),
      );
      return { directory, args };
    }
    try {
      process.env.DATABASE_URL = url;
      await sql`CREATE SCHEMA IF NOT EXISTS bot`;
      await sql`CREATE TABLE bot.db_manga_volumes (id integer PRIMARY KEY, series text, volume_number integer, visible boolean, title text, isbn text)`;
      await sql`CREATE TABLE bot.db_manga_chapters (id integer PRIMARY KEY, series text, chapter_number integer, volume_id integer REFERENCES bot.db_manga_volumes(id), title text, title_ja text, cover text, pages jsonb, visible boolean)`;
      for (let pass = 0; pass < 2; pass++)
        for (const statement of (
          await Bun.file(
            new URL(
              "../../apps/site/src/db/migrations/0023_manga_reader_extent.sql",
              import.meta.url,
            ),
          ).text()
        ).split("--> statement-breakpoint"))
          await sql.unsafe(statement);
      await sql`CREATE TABLE public.wiki_revisions (id text PRIMARY KEY, "tableName" text NOT NULL, "rowId" text NOT NULL, action text NOT NULL, label text, before jsonb, after jsonb, "editorName" text, "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP)`;
      await sql`INSERT INTO bot.db_manga_volumes (id,series,volume_number,visible) VALUES (702, 'SOSH', 2, true), (703, 'SOSH', 3, true), (704, 'SOSH', 4, true)`;
      const first = await job(2, 35002);
      await importSoshReaders([...first.args, "--apply"], fetcher);
      const [row] =
        await sql`SELECT *, jsonb_typeof(pages) AS page_type FROM bot.db_manga_chapters WHERE id=35002`;
      expect(row!.page_type).toBe("array");
      expect(row!.pages).toHaveLength(2);
      const revisions = await sql`SELECT * FROM public.wiki_revisions`;
      expect(revisions).toHaveLength(1);
      expect(revisions[0]!.after.pages).toEqual(row!.pages);
      await importSoshReaders([...first.args, "--apply"], fetcher);
      expect(await sql`SELECT id FROM public.wiki_revisions`).toHaveLength(1);
      await sql`INSERT INTO bot.db_manga_volumes (id,series,volume_number,visible) VALUES (705, 'SOSH', 5, true), (706, 'SOSH', 6, true), (707, 'SOSH', 7, true)`;
      await sql`ALTER TABLE bot.db_manga_chapters ADD COLUMN editorial_note text`;
      for (const number of [5, 6, 7])
        await sql`INSERT INTO bot.db_manga_chapters (id,series,chapter_number,volume_id,title,pages,visible,editorial_note) VALUES (${35000 + number},'SOSH',${number},${700 + number},'Pending','[]'::jsonb,false,'Preserve this note')`;
      await expect(job(5, 35005)).rejects.toThrow("protected");
      const stub = await job(5, 35005, ["--publish-empty-hidden"]);
      // The opt-in is part of the reviewed plan and cannot be added only at apply time.
      await expect(
        importSoshReaders(
          [...stub.args.filter((arg) => arg !== "--publish-empty-hidden"), "--apply"],
          fetcher,
        ),
      ).rejects.toThrow();
      await importSoshReaders([...stub.args, "--apply"], fetcher);
      const [published] = await sql`SELECT * FROM bot.db_manga_chapters WHERE id=35005`;
      expect(published!.visible).toBe(true);
      expect(published!.pages).toHaveLength(2);
      expect(published!.editorial_note).toBe("Preserve this note");
      const [revision] = await sql`SELECT * FROM public.wiki_revisions WHERE "rowId"='35005'`;
      expect(revision!.action).toBe("update");
      expect(revision!.before.pages).toEqual([]);
      expect(revision!.before.visible).toBe(false);
      expect(revision!.after.pages).toEqual(published!.pages);
      expect(revision!.after.editorialNote).toBe("Preserve this note");
      await importSoshReaders([...stub.args, "--apply"], fetcher);
      expect(await sql`SELECT id FROM public.wiki_revisions WHERE "rowId"='35005'`).toHaveLength(1);
      const editedStub = await job(6, 35006, ["--publish-empty-hidden"]);
      await sql`UPDATE bot.db_manga_chapters SET editorial_note='Concurrent owner edit' WHERE id=35006`;
      await expect(importSoshReaders([...editedStub.args, "--apply"], fetcher)).rejects.toThrow(
        "precondition",
      );
      expect(
        (await sql`SELECT visible FROM bot.db_manga_chapters WHERE id=35006`)[0]!.visible,
      ).toBe(false);
      const rollbackStub = await job(7, 35007, ["--publish-empty-hidden"]);
      await sql`ALTER TABLE public.wiki_revisions ADD CONSTRAINT reject_stub_revision CHECK ("rowId" <> '35007')`;
      await expect(importSoshReaders([...rollbackStub.args, "--apply"], fetcher)).rejects.toThrow();
      const [unchanged] = await sql`SELECT * FROM bot.db_manga_chapters WHERE id=35007`;
      expect(unchanged!.pages).toEqual([]);
      expect(unchanged!.visible).toBe(false);
      const conflict = await job(3, 35003);
      await sql`UPDATE bot.db_manga_volumes SET visible=false WHERE id=703`;
      await expect(importSoshReaders([...conflict.args, "--apply"], fetcher)).rejects.toThrow();
      expect(await sql`SELECT id FROM bot.db_manga_chapters WHERE id=35003`).toHaveLength(0);
      const rollback = await job(4, 35004);
      await sql`ALTER TABLE public.wiki_revisions ADD CONSTRAINT reject_fixture_revision CHECK ("rowId" <> '35004')`;
      await expect(importSoshReaders([...rollback.args, "--apply"], fetcher)).rejects.toThrow();
      expect(await sql`SELECT id FROM bot.db_manga_chapters WHERE id=35004`).toHaveLength(0);
      expect(await sql`SELECT id FROM public.wiki_revisions`).toHaveLength(2);
      const title = "Docteur Slump perfect edition - Tome 01";
      const source =
        "https://www.glenat.com/glenat-manga/docteur-slump-perfect-edition-tome-01-9782723472272/";
      await sql`INSERT INTO bot.db_manga_volumes (id,series,volume_number,visible,title,isbn) VALUES (740,'ARALE',1,true,${title},'9782723472272')`;
      const original = manifest(1, 45001);
      const generic = {
        ...original,
        collection: "MANGA",
        volumes: [
          {
            ...original.volumes[0],
            volumeId: 740,
            series: "ARALE",
            chapterNumber: 1,
            title,
            titleJa: null,
            expectedVolumeTitle: title,
            publicationExtent: { kind: "preview", sourceUrl: source, fullVolumePages: null },
            sourceUrl: source,
            pageCountEvidence: source,
            edition: {
              isbn: "9782723472272",
              language: "fr",
              colorization: "bw",
              format: "print",
              identityEvidence: source,
            },
          },
        ],
      };
      const manga = await job(1, 45001, [], generic);
      await importMangaReaders([...manga.args, "--apply"], fetcher);
      const [mangaRow] = await sql`SELECT * FROM bot.db_manga_chapters WHERE id=45001`;
      expect(mangaRow!.series).toBe("ARALE");
      expect(mangaRow!.reader_extent).toEqual({
        kind: "preview",
        sourceUrl: source,
        fullVolumePages: null,
      });
      expect(row!.reader_extent).toBeNull();
      await expect(
        (async () => {
          await sql`UPDATE bot.db_manga_chapters SET reader_extent=${sql.json({ kind: "invented" })} WHERE id=45001`;
        })(),
      ).rejects.toThrow();
      expect(mangaRow!.pages).toHaveLength(2);
      await importMangaReaders([...manga.args, "--apply"], fetcher);
      expect(await sql`SELECT id FROM public.wiki_revisions WHERE "rowId"='45001'`).toHaveLength(1);
      const yamchaTitle = "Dragon Ball Gaiden: That Time I Got Reincarnated as Yamcha";
      await sql`INSERT INTO bot.db_manga_volumes(id,series,volume_number,visible,title,isbn) VALUES(620,'DB_GAIDEN_YAMCHA',1,true,${yamchaTitle},'978-4-08-881261-8')`;
      const [yamchaVolume] = await sql`SELECT * FROM bot.db_manga_volumes WHERE id=620`;
      const editorialJob = await mkdtemp(join(tmpdir(), "manga-editor-pg-"));
      jobs.push(editorialJob);
      await chmod(editorialJob, 0o700);
      const bundle = {
        series: "DB_GAIDEN_YAMCHA",
        volumeId: 620,
        volumeNumber: 1,
        chapterId: 46001,
        chapterNumber: 1,
        isbn: "978-4-08-881261-8",
        activate: true,
        publicationExtent: {
          kind: "preview",
          sourceUrl: "https://shonenjumpplus.com/volume/4856001361007401134/trial",
          fullVolumePages: null,
        },
        expectedVolume: mangaEditorialRow(yamchaVolume!),
        expectedVolumeSha256: wikiUpdateSnapshotHash(mangaEditorialRow(yamchaVolume!)),
        expectedChapter: null,
        expectedChapterSha256: null,
        source: { documentUrl: "https://shonenjumpplus.com/volume/4856001361007401134/trial" },
        pages: [1, 2].map((number) => ({
          publicPath: "/assets/manga/YAMCHA/trial/" + number + ".jpg",
          sha256: archiveDigest(image),
        })),
      } as unknown as MangaBundle;
      const prepared = await prepareMangaEditorial(bundle, editorialJob, {
        fetcher,
        backup: async (directory) => {
          const child = Bun.spawn(
            [
              "docker",
              "exec",
              "shenron-sosh-import-fixture",
              "pg_dump",
              "-U",
              "fixture",
              "-p",
              fixture!.port,
              "-Fc",
              "shenron_sosh_fixture",
            ],
            { stdout: "pipe", stderr: "pipe" },
          );
          const bytes = new Uint8Array(await new Response(child.stdout).arrayBuffer());
          if (await child.exited) throw Error("Fixture backup failed");
          await Bun.write(join(directory, "catalog-before.dump"), bytes);
          await Bun.write(
            join(directory, "backup.json"),
            JSON.stringify({ inventoryVerified: true, sha256: archiveDigest(bytes) }),
          );
        },
      });
      const edited = await applyMangaEditorial(prepared);
      expect(edited.chapter.id).toBe(46001);
      expect(edited.chapter.readerExtent).toEqual(bundle.publicationExtent);
      await verifyMangaEditorial(prepared);
      expect(await sql`SELECT id FROM public.wiki_revisions WHERE "rowId"='46001'`).toHaveLength(1);
    } finally {
      if (oldUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = oldUrl;
      await sql`DROP TABLE IF EXISTS public.wiki_revisions, bot.db_manga_chapters, bot.db_manga_volumes`;
      await sql.end({ timeout: 5 });
      for (const directory of jobs) await rm(directory, { recursive: true, force: true });
    }
  },
  30000,
);
