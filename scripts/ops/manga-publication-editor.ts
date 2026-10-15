// SPDX-License-Identifier: Apache-2.0
/** Adapt the publication queue to the existing backed-up, transactional reader importer. */
import { mkdir, chmod, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { MangaBundle } from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
import { mangaVolumeBibliographicRecord } from "../../apps/site/src/lib/manga-source-registry";
import { mangaVolumeEdition } from "../../apps/site/src/lib/manga-volume-edition";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import { importMangaReaders, validateMangaReaderManifest } from "./import-manga-readers";
import type { SoshAssetFetcher } from "./import-sosh-readers";
import { archiveDigest } from "./apply-archive-catalog";
type Row = Record<string, unknown>;
export type PreparedMangaEditorial = {
  job: string;
  args: string[];
  chapterId: number;
  manifestSha256: string;
  fetcher?: SoshAssetFetcher;
};
export function mangaEditorialRow(row: Row): Row {
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
          value,
        ]),
      ),
    ),
  );
}
function conflict(): never {
  throw Object.assign(new Error("Canonical editorial snapshot changed"), {
    code: "MANGA_CAS_CONFLICT",
  });
}
export async function prepareMangaEditorial(
  bundle: MangaBundle,
  job: string,
  ports: { backup(directory: string): Promise<void>; fetcher?: SoshAssetFetcher },
) {
  if (!isAbsolute(job)) throw Error("Absolute editorial job required");
  await mkdir(job, { recursive: true, mode: 0o700 });
  const info = await lstat(job);
  if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
    throw Error("Private editorial directory required");
  if (!bundle.publicationExtent)
    throw Error("Explicit publication extent required before editorial intake");
  const identity = {
    id: bundle.volumeId,
    title: String(bundle.expectedVolume.title ?? ""),
    isbn: bundle.isbn,
  };
  const bibliography = mangaVolumeBibliographicRecord(identity);
  if (!bibliography) throw Error("Exact publisher bibliography required");
  const edition = mangaVolumeEdition(bundle.series, identity);
  const body = JSON.stringify(
    validateMangaReaderManifest({
      version: 1,
      collection: "MANGA",
      rightsEvidence:
        "Pinned publication source and explicit owner authorization retained in parent provenance.json",
      volumes: [
        {
          volumeId: bundle.volumeId,
          volumeNumber: bundle.volumeNumber,
          chapterId: bundle.chapterId,
          chapterNumber: bundle.chapterNumber,
          series: bundle.series,
          title: String(bundle.expectedChapter?.title ?? bundle.expectedVolume.title ?? ""),
          titleJa: bundle.expectedChapter?.titleJa ?? bundle.expectedVolume.titleJa ?? null,
          expectedVolumeTitle: identity.title,
          sourceUrl: bundle.source.documentUrl,
          pageCountEvidence: bundle.source.documentUrl,
          expectedPages: bundle.pages.length,
          review: "approved",
          publicationExtent: bundle.publicationExtent,
          edition: {
            isbn: bundle.isbn,
            language: edition.language,
            colorization: edition.colorization,
            format: bibliography.jdcn ? "digital" : "print",
            identityEvidence: bibliography.sourceUrl,
          },
          pages: bundle.pages.map((page, index) => ({
            number: index + 1,
            readerImage: "https://cdn.dragonballfr.com" + page.publicPath,
            sha256: page.sha256,
          })),
        },
      ],
    }),
  );
  const manifestSha256 = archiveDigest(body),
    path = join(job, "manifest.json");
  if (await Bun.file(path).exists()) {
    if (archiveDigest(await Bun.file(path).bytes()) !== manifestSha256) conflict();
  } else {
    await Bun.write(path, body);
    await chmod(path, 0o600);
  }
  const args = ["--job", job, "--expected-sha", manifestSha256];
  if (bundle.expectedChapter?.visible === false) {
    if (!bundle.activate) throw Error("Explicit activation consent required");
    args.push("--publish-empty-hidden");
  }
  if (!(await Bun.file(join(job, "apply-plan.json")).exists()))
    await importMangaReaders(args, ports.fetcher);
  const before = await Bun.file(join(job, "before.json")).json();
  const volume = before.volumes.find((row: Row) => Number(row.id) === bundle.volumeId);
  const chapter = before.chapters.find((row: Row) => Number(row.id) === bundle.chapterId);
  if (!volume || wikiUpdateSnapshotHash(mangaEditorialRow(volume)) !== bundle.expectedVolumeSha256)
    conflict();
  if (bundle.expectedChapter) {
    if (
      !chapter ||
      wikiUpdateSnapshotHash(mangaEditorialRow(chapter)) !== bundle.expectedChapterSha256
    )
      conflict();
  } else if (chapter) conflict();
  if (!(await Bun.file(join(job, "backup.json")).exists())) await ports.backup(job);
  return { job, args, chapterId: bundle.chapterId, manifestSha256, fetcher: ports.fetcher };
}
export async function applyMangaEditorial(prepared: PreparedMangaEditorial) {
  await importMangaReaders([...prepared.args, "--apply"], prepared.fetcher);
  const after = await Bun.file(join(prepared.job, "after.json")).json();
  const row = after.chapters.find((entry: Row) => Number(entry.id) === prepared.chapterId);
  if (!row) throw Error("Canonical editorial readback missing");
  return { chapter: mangaEditorialRow(row) };
}
export async function verifyMangaEditorial(prepared: PreparedMangaEditorial) {
  // The importer independently re-reads all target rows and validates the committed receipt on replay.
  await importMangaReaders([...prepared.args, "--apply"], prepared.fetcher);
  return { complete: true };
}
