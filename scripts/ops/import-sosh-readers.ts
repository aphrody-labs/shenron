// SPDX-License-Identifier: Apache-2.0
import { chmod, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { archiveDigest } from "./apply-archive-catalog";
import { mangaVolumeEdition } from "../../apps/site/src/lib/manga-volume-edition";
import { mangaVolumeBibliographicRecord } from "../../apps/site/src/lib/manga-source-registry";
import { mangaReaderExtent } from "../../apps/site/src/lib/manga-reader-extent";
const seriesFor = (volume: ReaderManifest["volumes"][number]) =>
  "series" in volume ? volume.series : "SOSH";
const chapterNumberFor = (volume: ReaderManifest["volumes"][number]) =>
  "chapterNumber" in volume ? volume.chapterNumber : volume.volumeNumber;

export { validateSoshReaderManifest } from "../../packages/pipeline/src/dragon-ball/sosh-reader-manifest";
import {
  validateSoshReaderManifest,
  validateMangaReaderManifest,
  type ReaderManifest,
} from "../../packages/pipeline/src/dragon-ball/sosh-reader-manifest";

/** Fetch the exact public object without redirecting to an unreviewed provider. */
export type SoshAssetFetcher = (url: string, options: RequestInit) => Promise<Response>;
export async function verifySoshReaderAssets(
  manifest: ReaderManifest,
  fetcher: SoshAssetFetcher = fetch,
) {
  let verified = 0;
  for (const volume of manifest.volumes)
    for (const page of volume.pages) {
      const response = await fetcher(page.readerImage, {
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/") ||
        !response.body
      )
        throw new Error(`Reader image unavailable: ${volume.volumeNumber}:${page.number}`);
      const max = 32 * 1024 * 1024;
      let size = 0;
      const hash = new Bun.CryptoHasher("sha256");
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > max) throw new Error("Reader image exceeds bounded size");
          hash.update(value);
        }
      } finally {
        await reader.cancel();
      }
      if (!size || hash.digest("hex") !== page.sha256)
        throw new Error("Reader image digest differs");
      verified++;
    }
  return verified;
}

type Row = Record<string, unknown>;
export interface SoshSnapshot {
  volumes: Row[];
  chapters: Row[];
}
export const soshSnapshotDigest = (snapshot: SoshSnapshot) =>
  archiveDigest(JSON.stringify(snapshot));
export function missingReaderChapters(
  manifest: ReaderManifest,
  snapshot: SoshSnapshot,
  options: { publishEmptyHidden?: boolean } = {},
) {
  return manifest.volumes.filter((volume) => {
    const storedVolume = snapshot.volumes.find((row) => Number(row.id) === volume.volumeId);
    if (
      !storedVolume ||
      storedVolume.series !== seriesFor(volume) ||
      !storedVolume.visible ||
      Number(storedVolume.volume_number) !== volume.volumeNumber
    )
      throw new Error("SOSH volume identity or visibility differs");
    if ("edition" in volume) {
      const identity = {
        id: Number(storedVolume.id),
        isbn: typeof storedVolume.isbn === "string" ? storedVolume.isbn : null,
        title: typeof storedVolume.title === "string" ? storedVolume.title : null,
      };
      const edition = mangaVolumeEdition(volume.series, identity);
      const bibliography = mangaVolumeBibliographicRecord(identity);
      if (!bibliography)
        throw Error("Unambiguous publisher bibliography required for a generic manga import");
      if (
        edition.language !== volume.edition.language ||
        edition.colorization !== volume.edition.colorization
      )
        throw Error("Manifest edition differs from the canonical reader publication");
      if (bibliography && bibliography.sourceUrl !== volume.edition.identityEvidence)
        throw Error("Primary edition evidence differs from the ISBN bibliography");
      if ((bibliography.jdcn ? "digital" : "print") !== volume.edition.format)
        throw Error("Source format differs from the canonical publication");
      if (
        storedVolume.title !== volume.expectedVolumeTitle ||
        String(storedVolume.isbn ?? "")
          .replaceAll("-", "")
          .toUpperCase() !==
          String(volume.edition.isbn ?? "")
            .replaceAll("-", "")
            .toUpperCase()
      )
        throw Error("Target volume title or ISBN differs from reviewed edition");
    }
    const existing = snapshot.chapters.filter(
      (row) => Number(row.volume_id) === volume.volumeId || Number(row.id) === volume.chapterId,
    );
    if (!existing.length) return true;
    if (existing.length !== 1) throw new Error("Ambiguous SOSH chapter identity");
    const chapter = existing[0]!;
    if (
      Number(chapter.id) !== volume.chapterId ||
      Number(chapter.volume_id) !== volume.volumeId ||
      chapter.series !== seriesFor(volume) ||
      Number(chapter.chapter_number) !== chapterNumberFor(volume)
    )
      throw new Error("Existing SOSH chapter identity differs; protected from overwrite");
    if (
      options.publishEmptyHidden &&
      chapter.visible === false &&
      Array.isArray(chapter.pages) &&
      chapter.pages.length === 0
    )
      return true;
    if (
      !chapter.visible ||
      chapter.title !== volume.title ||
      chapter.title_ja !== volume.titleJa ||
      JSON.stringify(chapter.pages) !==
        JSON.stringify(volume.pages.map((page) => page.readerImage)) ||
      chapter.cover !== volume.pages[0]!.readerImage ||
      (volume.publicationExtent &&
        JSON.stringify(mangaReaderExtent(chapter.reader_extent)) !==
          JSON.stringify(mangaReaderExtent(volume.publicationExtent)))
    )
      throw new Error("Existing SOSH chapter differs; protected from overwrite");
    return false;
  });
}

export const missingSoshChapters = missingReaderChapters;

export async function importSoshReaders(
  args = Bun.argv.slice(2),
  fetcher: SoshAssetFetcher = fetch,
  mode: "SOSH" | "MANGA" = "SOSH",
) {
  const schemaPrefix = mode === "MANGA" ? "shenron-manga-reader" : "shenron-sosh-reader";
  const { values } = parseArgs({
    args,
    options: {
      job: { type: "string" },
      "expected-sha": { type: "string" },
      apply: { type: "boolean", default: false },
      "publish-empty-hidden": { type: "boolean", default: false },
    },
  });
  if (!values.job || !isAbsolute(values.job) || !values["expected-sha"])
    throw new Error(
      "Usage: import-sosh-readers --job <protected-absolute-directory> --expected-sha <manifest-sha256> [--apply]",
    );
  const root = values.job;
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("Protected job directory required");
  const body = await Bun.file(join(root, "manifest.json")).text();
  if (archiveDigest(body) !== values["expected-sha"]) throw new Error("Pinned manifest differs");
  const manifest =
    mode === "MANGA"
      ? validateMangaReaderManifest(JSON.parse(body))
      : validateSoshReaderManifest(JSON.parse(body));
  const options = { publishEmptyHidden: values["publish-empty-hidden"] };
  const verifiedAssets = await verifySoshReaderAssets(manifest, fetcher);
  if (!process.env.DATABASE_URL) throw new Error("Existing protected DATABASE_URL required");
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    prepare: false,
    connection: { statement_timeout: 30000 },
  });
  const volumeIds = manifest.volumes.map((volume) => volume.volumeId);
  const chapterIds = manifest.volumes.map((volume) => volume.chapterId);
  const snapshot = async (db: postgres.Sql | postgres.TransactionSql): Promise<SoshSnapshot> => ({
    volumes: await db`SELECT * FROM bot.db_manga_volumes WHERE id IN ${db(volumeIds)} ORDER BY id`,
    chapters:
      await db`SELECT * FROM bot.db_manga_chapters WHERE volume_id IN ${db(volumeIds)} OR id IN ${db(chapterIds)} ORDER BY id`,
  });
  const save = async (name: string, value: unknown) => {
    const path = join(root, name);
    if (await Bun.file(path).exists()) throw new Error(`Receipt already exists: ${name}`);
    await Bun.write(path, JSON.stringify(value, null, 2) + "\n");
    await chmod(path, 0o600);
  };
  try {
    const current = await snapshot(sql);
    const missing = missingSoshChapters(manifest, current, options);
    const updates = missing.filter((volume) =>
      current.chapters.some((row) => Number(row.id) === volume.chapterId),
    );
    if (!values.apply) {
      await save("before.json", current);
      const plan = {
        schema: schemaPrefix + "-plan/v1",
        manifestSha256: values["expected-sha"],
        beforeSha256: soshSnapshotDigest(current),
        newChapters: missing.length - updates.length,
        publishedEmptyChapters: updates.length,
        publishEmptyHidden: options.publishEmptyHidden,
        unchangedChapters: manifest.volumes.length - missing.length,
        verifiedAssets,
        observedAt: new Date().toISOString(),
      };
      await save("apply-plan.json", plan);
      console.log(JSON.stringify(plan));
      return;
    }
    const receiptFile = Bun.file(join(root, "receipt.json"));
    if (await receiptFile.exists()) {
      const receipt = await receiptFile.json();
      if (
        receipt.manifestSha256 !== values["expected-sha"] ||
        receipt.afterSha256 !== soshSnapshotDigest(current) ||
        missing.length
      )
        throw new Error("Idempotent replay differs");
      console.log(JSON.stringify({ ...receipt, replay: true }));
      return;
    }
    const plan = await Bun.file(join(root, "apply-plan.json")).json();
    const before = await Bun.file(join(root, "before.json")).json();
    const backup = await Bun.file(join(root, "backup.json")).json();
    if (
      plan.schema !== schemaPrefix + "-plan/v1" ||
      plan.manifestSha256 !== values["expected-sha"] ||
      plan.beforeSha256 !== soshSnapshotDigest(before) ||
      plan.beforeSha256 !== soshSnapshotDigest(current) ||
      Boolean(plan.publishEmptyHidden) !== options.publishEmptyHidden ||
      !backup.inventoryVerified ||
      !/^[a-f0-9]{64}$/.test(backup.sha256) ||
      archiveDigest(await Bun.file(join(root, "catalog-before.dump")).bytes()) !== backup.sha256
    )
      throw new Error("SOSH snapshot, backup or optimistic precondition differs");
    const expected = await sql.begin(async (tx) => {
      // Serialize catalogue inserts too: absent chapter rows cannot be locked individually.
      await tx`LOCK TABLE bot.db_manga_volumes, bot.db_manga_chapters IN SHARE ROW EXCLUSIVE MODE`;
      const locked = await snapshot(tx);
      if (soshSnapshotDigest(locked) !== plan.beforeSha256)
        throw new Error("SOSH catalogue changed after plan");
      for (const volume of missingSoshChapters(manifest, locked, options)) {
        const pages = volume.pages.map((page) => page.readerImage);
        const extent = volume.publicationExtent ? tx.json(volume.publicationExtent) : null;
        const existingChapter = locked.chapters.find((row) => Number(row.id) === volume.chapterId);
        const written = existingChapter
          ? await tx`UPDATE bot.db_manga_chapters SET title=${volume.title}, title_ja=${volume.titleJa}, cover=${pages[0]!}, pages=${tx.json(pages)}, reader_extent=COALESCE(${extent},reader_extent), visible=true
              WHERE id=${volume.chapterId} AND visible=false AND pages='[]'::jsonb RETURNING *`
          : await tx`INSERT INTO bot.db_manga_chapters (id, series, chapter_number, volume_id, title, title_ja, cover, pages, reader_extent, visible)
              VALUES (${volume.chapterId}, ${seriesFor(volume)}, ${chapterNumberFor(volume)}, ${volume.volumeId}, ${volume.title}, ${volume.titleJa}, ${pages[0]!}, ${tx.json(pages)}, ${extent}, true) RETURNING *`;
        if (written.length !== 1) throw new Error("SOSH chapter write precondition differs");
        const wikiRow = (row: Row): postgres.JSONValue =>
          JSON.parse(
            JSON.stringify(
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                  key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
                  value,
                ]),
              ),
            ),
          );
        await tx`INSERT INTO public.wiki_revisions (id, "tableName", "rowId", action, label, before, after, "editorName")
          VALUES (${crypto.randomUUID()}, 'db_manga_chapters', ${String(volume.chapterId)}, ${existingChapter ? "update" : "create"}, ${volume.title}, ${existingChapter ? tx.json(wikiRow(existingChapter)) : null},
          ${tx.json(wikiRow(written[0]!))}, ${mode === "MANGA" ? "manga-reader-import" : "sosh-reader-import"})`;
      }
      const after = await snapshot(tx);
      if (missingSoshChapters(manifest, after).length)
        throw new Error("SOSH transaction readback incomplete");
      return after;
    });
    const after = await snapshot(sql);
    if (
      soshSnapshotDigest(after) !== soshSnapshotDigest(expected) ||
      missingSoshChapters(manifest, after).length
    )
      throw new Error("Independent SOSH readback differs");
    const receipt = {
      schema: schemaPrefix + "-receipt/v1",
      manifestSha256: values["expected-sha"],
      beforeSha256: plan.beforeSha256,
      afterSha256: soshSnapshotDigest(after),
      insertedChapters: missing.length - updates.length,
      publishedEmptyChapters: updates.length,
      verifiedAssets,
      observedAt: new Date().toISOString(),
    };
    await save("after.json", after);
    await save("receipt.json", receipt);
    console.log(JSON.stringify(receipt));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
if (import.meta.main) await importSoshReaders();
