// SPDX-License-Identifier: Apache-2.0
/** Product manga policy over native Web acquisition; no network/image engine. */
import { join, relative, resolve } from "node:path";
import type postgres from "postgres";
import { createDatabooksFreezeGate } from "@shenron/db/guards";
import { runAphrodyCommand, type NativeCommandExecutor } from "../aphrody/native-commands";
import {
  copyEditorialAsset,
  nativeAssetReport,
  readVerifiedNativeAsset,
  type EditorialWriteGate,
  type NativeAcquiredAsset,
} from "./assets";

export interface MangaVolume {
  id: number;
  number: number;
}
export interface MangaChapter {
  volumeId: number;
  number: number;
  title: string;
  cover: string;
  pages: string[];
}
export interface MangaEditorialPort {
  listVolumes(): Promise<MangaVolume[]>;
  hasPages(volumeId: number, title: string): Promise<boolean>;
  insertChapter(chapter: MangaChapter): Promise<void>;
}
export interface PromotionalReview {
  text: string;
  suspect?: boolean;
  meanConfidence: number;
}
export interface MangaImportOptions {
  nativeOutputDir: string;
  publicAssetsDir: string;
  stateDir?: string;
  from?: number;
  to?: number;
  dryRun?: boolean;
  force?: boolean;
  render?: boolean;
  maxFiles?: number;
  nativeExecutor?: NativeCommandExecutor;
  timeoutMs?: number;
  signal?: AbortSignal;
  writeGate?: EditorialWriteGate;
  checkPromotionalPages?: boolean;
  /** The product OCR owner is injected; frozen execution never invokes it. */
  reviewPromotionalPage?: (
    asset: NativeAcquiredAsset,
    bytes: Uint8Array,
  ) => Promise<PromotionalReview>;
}

/** Preserve the previous conservative edge-page policy without deleting scans. */
export function isPromotionalPage(review: PromotionalReview): boolean {
  if (review.suspect || !Number.isFinite(review.meanConfidence) || review.meanConfidence < 0.8)
    return false;
  const text = review.text.toLowerCase().replace(/\s+/g, " ");
  return (
    text.includes("sushiscan") ||
    (text.includes("lisez") && text.includes("chapitres")) ||
    /lettering|translator|traduction|interior design/.test(text)
  );
}

export async function importDragonBallManga(
  options: MangaImportOptions,
  port: MangaEditorialPort,
): Promise<{
  dryRun: boolean;
  planned: number;
  imported: number;
  reused: number;
  excluded: Array<{ volume: number; path: string; reason: string }>;
}> {
  const from = options.from ?? 1;
  const to = options.to ?? 42;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to > 42 || from > to)
    throw new RangeError("Original manga range must be between 1 and 42");
  const volumes = (await port.listVolumes())
    .filter((volume) => volume.number >= from && volume.number <= to)
    .toSorted((a, b) => a.number - b.number);
  if (
    volumes.some(
      (volume) =>
        !Number.isSafeInteger(volume.id) || volume.id < 1 || !Number.isSafeInteger(volume.number),
    )
  )
    throw new Error("Invalid editorial volume identity");
  const result = {
    dryRun: options.dryRun !== false,
    planned: volumes.length,
    imported: 0,
    reused: 0,
    excluded: [] as Array<{ volume: number; path: string; reason: string }>,
  };
  if (result.dryRun) return result;
  const gate =
    options.writeGate ?? createDatabooksFreezeGate({ freezeFile: null, production: true });
  gate.assertWritable();
  if (options.checkPromotionalPages && !options.reviewPromotionalPage)
    throw new Error("Promotional review requires the product OCR owner");
  for (const volume of volumes) {
    options.signal?.throwIfAborted();
    const title = `Tome ${volume.number}`;
    if (!options.force && (await port.hasPages(volume.id, title))) {
      result.reused++;
      continue;
    }
    const args = [
      "web",
      "dragon-ball",
      "manga-volume",
      "--volume",
      String(volume.number),
      "--profile",
      "shenron",
      "--output",
      resolve(options.nativeOutputDir),
      "--max-files",
      String(options.maxFiles ?? 300),
      "--json",
    ];
    if (options.stateDir) args.push("--state", resolve(options.stateDir));
    if (options.force) args.push("--force");
    if (options.render) args.push("--render");
    gate.assertWritable();
    const native = await runAphrodyCommand(args, {
      json: true,
      nativeExecutor: options.nativeExecutor,
      timeoutMs: options.timeoutMs ?? 3_600_000,
      signal: options.signal,
    });
    if (native.kind !== "exit" || !native.ok)
      throw new Error(`Native manga acquisition failed: ${native.kind}`);
    const receipt = nativeAssetReport(native.data);
    if (!receipt.files.length) throw new Error("Native volume has no acquired pages");
    const pages: string[] = [];
    const edges = new Set([
      0,
      1,
      2,
      receipt.files.length - 1,
      receipt.files.length - 2,
      receipt.files.length - 3,
    ]);
    for (const [index, asset] of receipt.files.entries()) {
      const path = relative(resolve(options.nativeOutputDir, "assets"), resolve(asset.path));
      if (!new RegExp(`^manga/DB/regular/vol${volume.number}/[0-9]+\\.webp$`).test(path))
        throw new Error("Native volume page path does not match its editorial identity");
      const bytes = await readVerifiedNativeAsset(asset, options.nativeOutputDir);
      if (options.checkPromotionalPages && edges.has(index)) {
        gate.assertWritable();
        let review: PromotionalReview | undefined;
        try {
          review = await options.reviewPromotionalPage!(asset, bytes);
        } catch {
          /* Failed OCR retains the page. */
        }
        if (review && isPromotionalPage(review)) {
          result.excluded.push({
            volume: volume.number,
            path: asset.path,
            reason: "promotional-page-policy",
          });
          continue;
        }
      }
      gate.assertWritable();
      await copyEditorialAsset(
        asset.path,
        join(resolve(options.publicAssetsDir), path),
        asset.sha256,
      );
      pages.push(`./assets/${path.replaceAll("\\", "/")}`);
    }
    if (!pages.length) throw new Error("No editorial pages remain after the product review");
    gate.assertWritable();
    await port.insertChapter({
      volumeId: volume.id,
      number: volume.number,
      title,
      cover: pages[0]!,
      pages,
    });
    result.imported++;
  }
  return result;
}

/** Caller owns connection, production authority and transaction lifetime. */
export function createPostgresMangaEditorialPort(sql: postgres.Sql): MangaEditorialPort {
  return {
    async listVolumes() {
      const rows =
        await sql`select id,volume_number from bot.db_manga_volumes where title like 'Dragon Ball Vol. %'`;
      return rows.map((row) => ({ id: Number(row.id), number: Number(row.volume_number) }));
    },
    async hasPages(volumeId, title) {
      return (
        (
          await sql`select id from bot.db_manga_chapters where volume_id=${volumeId} and title=${title} and pages is not null and jsonb_array_length(pages)>0 limit 1`
        ).length > 0
      );
    },
    async insertChapter(chapter) {
      const rows =
        await sql`insert into bot.db_manga_chapters (series,chapter_number,title,cover,pages,volume_id) values ('DB',${chapter.number},${chapter.title},${chapter.cover},${sql.json(chapter.pages)},${chapter.volumeId}) on conflict do nothing returning id`;
      if (!rows.length)
        throw new Error("Existing editorial chapter requires review before replacement");
    },
  };
}
