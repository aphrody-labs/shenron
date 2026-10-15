// SPDX-License-Identifier: Apache-2.0
import { chmod, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { archiveDigest } from "./apply-archive-catalog";

export { validateSoshReaderManifest } from "../../packages/pipeline/src/dragon-ball/sosh-reader-manifest";
import {
  validateSoshReaderManifest,
  type SoshReaderManifest,
} from "../../packages/pipeline/src/dragon-ball/sosh-reader-manifest";

/** Fetch the exact public object without redirecting to an unreviewed provider. */
export type SoshAssetFetcher = (url: string, options: RequestInit) => Promise<Response>;
export async function verifySoshReaderAssets(
  manifest: SoshReaderManifest,
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
export function missingSoshChapters(manifest: SoshReaderManifest, snapshot: SoshSnapshot) {
  return manifest.volumes.filter((volume) => {
    const storedVolume = snapshot.volumes.find((row) => Number(row.id) === volume.volumeId);
    if (
      !storedVolume ||
      storedVolume.series !== "SOSH" ||
      !storedVolume.visible ||
      Number(storedVolume.volume_number) !== volume.volumeNumber
    )
      throw new Error("SOSH volume identity or visibility differs");
    const existing = snapshot.chapters.filter(
      (row) => Number(row.volume_id) === volume.volumeId || Number(row.id) === volume.chapterId,
    );
    if (!existing.length) return true;
    if (existing.length !== 1) throw new Error("Ambiguous SOSH chapter identity");
    const chapter = existing[0]!;
    if (
      Number(chapter.id) !== volume.chapterId ||
      Number(chapter.volume_id) !== volume.volumeId ||
      chapter.series !== "SOSH" ||
      Number(chapter.chapter_number) !== volume.volumeNumber ||
      !chapter.visible ||
      chapter.title !== volume.title ||
      chapter.title_ja !== volume.titleJa ||
      JSON.stringify(chapter.pages) !==
        JSON.stringify(volume.pages.map((page) => page.readerImage)) ||
      chapter.cover !== volume.pages[0]!.readerImage
    )
      throw new Error("Existing SOSH chapter differs; protected from overwrite");
    return false;
  });
}

export async function importSoshReaders(
  args = Bun.argv.slice(2),
  fetcher: SoshAssetFetcher = fetch,
) {
  const { values } = parseArgs({
    args,
    options: {
      job: { type: "string" },
      "expected-sha": { type: "string" },
      apply: { type: "boolean", default: false },
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
  const manifest = validateSoshReaderManifest(JSON.parse(body));
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
    const missing = missingSoshChapters(manifest, current);
    if (!values.apply) {
      await save("before.json", current);
      const plan = {
        schema: "shenron-sosh-reader-plan/v1",
        manifestSha256: values["expected-sha"],
        beforeSha256: soshSnapshotDigest(current),
        newChapters: missing.length,
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
      plan.schema !== "shenron-sosh-reader-plan/v1" ||
      plan.manifestSha256 !== values["expected-sha"] ||
      plan.beforeSha256 !== soshSnapshotDigest(before) ||
      plan.beforeSha256 !== soshSnapshotDigest(current) ||
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
      for (const volume of missingSoshChapters(manifest, locked)) {
        const pages = volume.pages.map((page) => page.readerImage);
        await tx`INSERT INTO bot.db_manga_chapters (id, series, chapter_number, volume_id, title, title_ja, cover, pages, visible)
          VALUES (${volume.chapterId}, 'SOSH', ${volume.volumeNumber}, ${volume.volumeId}, ${volume.title}, ${volume.titleJa}, ${pages[0]!}, ${tx.json(pages)}, true)`;
        await tx`INSERT INTO public.wiki_revisions (id, "tableName", "rowId", action, label, before, after, "editorName")
          VALUES (${crypto.randomUUID()}, 'db_manga_chapters', ${String(volume.chapterId)}, 'create', ${volume.title}, NULL,
          ${tx.json({
            series: "SOSH",
            chapterNumber: volume.volumeNumber,
            volumeId: volume.volumeId,
            title: volume.title,
            titleJa: volume.titleJa,
            cover: pages[0]!,
            pages,
            visible: true,
          })}, 'sosh-reader-import')`;
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
      schema: "shenron-sosh-reader-receipt/v1",
      manifestSha256: values["expected-sha"],
      beforeSha256: plan.beforeSha256,
      afterSha256: soshSnapshotDigest(after),
      insertedChapters: missing.length,
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
