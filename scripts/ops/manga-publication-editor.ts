// SPDX-License-Identifier: Apache-2.0
/** Publication consumes the canonical importer; generic wiki PATCH never writes reader assets. */
import { chmod, link, lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { mangaBundleSchema } from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import { mangaVolumeBibliographicRecord } from "../../apps/site/src/lib/manga-source-registry";
import { mangaVolumeEdition } from "../../apps/site/src/lib/manga-volume-edition";
import {
  importSoshReaders,
  readerWikiRow,
  readerBackupDigest,
  ReaderImportConflict,
  type SoshAssetFetcher,
} from "./import-sosh-readers";

export class MangaEditorialConflict extends Error {
  override name = "MangaEditorialConflict";
  readonly code = "MANGA_CAS_CONFLICT";
}
async function invokeImporter(...args: Parameters<typeof importSoshReaders>) {
  try {
    return await importSoshReaders(...args);
  } catch (error) {
    if (error instanceof ReaderImportConflict)
      throw new MangaEditorialConflict(error.message, { cause: error });
    throw error;
  }
}
export interface PreparedMangaEditorial {
  schema: "shenron-manga-editorial/v1";
  job: string;
  mode: "SOSH" | "MANGA";
  manifestSha256: string;
  bundleSha256: string;
}
export interface MangaEditorialOptions {
  databaseUrl?: string;
  publicOrigin?: string;
  backup?: (job: string) => Promise<void>;
  fetcher?: SoshAssetFetcher;
}
const digest = (body: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(body).digest("hex");
async function privateJob(job: string) {
  if (!isAbsolute(job)) throw Error("Absolute editorial job required");
  await mkdir(job, { recursive: true, mode: 0o700 });
  const stat = await lstat(job);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    (await realpath(job)) !== resolve(job)
  )
    throw Error("Private editorial job identity differs");
}
async function once(path: string, value: unknown) {
  const body = JSON.stringify(value, null, 2) + "\n",
    temp = path + "." + crypto.randomUUID();
  await Bun.write(temp, body);
  await chmod(temp, 0o600);
  try {
    await link(temp, path);
  } catch (error) {
    if (
      (error as { code?: string }).code !== "EEXIST" ||
      (await lstat(path)).isSymbolicLink() ||
      (await Bun.file(path).text()) !== body
    )
      throw Error("Immutable editorial input changed", { cause: error });
  } finally {
    await unlink(temp);
  }
}
async function backupVerified(job: string) {
  const receipt = await Bun.file(join(job, "backup.json")).json();
  const file = join(job, "catalog-before.dump"),
    stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || !receipt.inventoryVerified)
    throw Error("Canonical backup inventory missing");
  if ((await readerBackupDigest(file)) !== receipt.sha256)
    throw Error("Canonical backup bytes changed");
}
function importerArgs(prepared: PreparedMangaEditorial, apply = false) {
  return [
    "--job",
    prepared.job,
    "--expected-sha",
    prepared.manifestSha256,
    "--publish-empty-hidden",
    ...(apply ? ["--apply"] : ["--defer-assets"]),
  ];
}
async function pinned(prepared: PreparedMangaEditorial) {
  await privateJob(prepared.job);
  const saved = await Bun.file(join(prepared.job, "prepared.json")).json();
  if (JSON.stringify(saved) !== JSON.stringify(prepared))
    throw Error("Editorial preparation changed");
  const body = await Bun.file(join(prepared.job, "bundle.json")).text();
  if (digest(body) !== prepared.bundleSha256) throw Error("Prepared bundle changed");
  await backupVerified(prepared.job);
  return mangaBundleSchema.parse(JSON.parse(body));
}

/** Plans without mutation or fabricated chapter identity; backup is an injected Infra capability. */
export async function prepareMangaEditorial(
  value: unknown,
  job: string,
  options: MangaEditorialOptions = {},
) {
  await privateJob(job);
  const bundle = mangaBundleSchema.parse(value);
  if (!bundle.publicationExtent)
    throw Error("Explicit publication extent required before editorial intake");
  if (
    (bundle.chapterId === null) !== (bundle.expectedChapter === null) ||
    (bundle.expectedChapter === null) !== (bundle.expectedChapterSha256 === null) ||
    (bundle.expectedChapter === null && !bundle.activate)
  )
    throw Error("Explicit chapter absence invariant differs");
  if (
    wikiUpdateSnapshotHash(bundle.expectedVolume) !== bundle.expectedVolumeSha256 ||
    (bundle.expectedChapter &&
      wikiUpdateSnapshotHash(bundle.expectedChapter) !== bundle.expectedChapterSha256)
  )
    throw Error("Editorial bundle snapshot differs");
  const v = bundle.expectedVolume,
    c = bundle.expectedChapter;
  const identity = {
    id: bundle.volumeId,
    isbn: typeof v.isbn === "string" ? v.isbn : null,
    title: typeof v.title === "string" ? v.title : null,
  };
  const bibliography = mangaVolumeBibliographicRecord(identity),
    edition = mangaVolumeEdition(bundle.series, identity);
  const title = c?.title ?? v.title ?? bibliography?.title;
  if (typeof title !== "string" || !title) throw Error("Canonical reader title missing");
  const origin = new URL(options.publicOrigin ?? "https://cdn.dragonballfr.com");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error("Exact public asset origin required");
  const volume = {
    volumeId: bundle.volumeId,
    volumeNumber: bundle.volumeNumber,
    chapterId: bundle.chapterId,
    title,
    titleJa: c?.titleJa ?? v.titleJa ?? null,
    sourceUrl: bundle.source.documentUrl,
    pageCountEvidence: bundle.source.documentUrl,
    expectedPages: bundle.pages.length,
    review: "approved",
    publicationExtent: bundle.publicationExtent,
    pages: bundle.pages.map((page, index) => ({
      number: index + 1,
      readerImage: new URL(page.publicPath, origin).href,
      sha256: page.sha256,
    })),
  };
  if (bundle.series === "SOSH" && bundle.chapterId === null)
    throw Error("SOSH requires its reviewed chapter identity");
  const manifest =
    bundle.series === "SOSH"
      ? {
          version: 1,
          collection: "SOSH",
          rightsEvidence: "AGENTS.md owner attestation 2026-10-13; approved captured manga bundle",
          volumes: [volume],
        }
      : {
          version: 1,
          collection: "MANGA",
          rightsEvidence: "AGENTS.md owner attestation 2026-10-13; approved captured manga bundle",
          volumes: [
            {
              ...volume,
              series: bundle.series,
              chapterNumber: bundle.chapterNumber,
              expectedVolumeTitle: identity.title,
              edition: {
                isbn: identity.isbn,
                language: edition.language,
                colorization: edition.colorization,
                format: bibliography?.jdcn ? "digital" : "print",
                identityEvidence: bibliography?.sourceUrl,
              },
            },
          ],
        };
  await once(join(job, "bundle.json"), bundle);
  await once(join(job, "manifest.json"), manifest);
  const prepared: PreparedMangaEditorial = {
    schema: "shenron-manga-editorial/v1",
    job,
    mode: bundle.series === "SOSH" ? "SOSH" : "MANGA",
    manifestSha256: digest(await Bun.file(join(job, "manifest.json")).text()),
    bundleSha256: digest(await Bun.file(join(job, "bundle.json")).text()),
  };
  if (await Bun.file(join(job, "prepared.json")).exists()) {
    await pinned(prepared);
    return prepared;
  }
  const result = await invokeImporter(
    importerArgs(prepared),
    options.fetcher,
    prepared.mode,
    options,
  );
  if (!result || !("plan" in result)) throw Error("Canonical importer did not prepare a plan");
  const volumes = result.snapshot.volumes,
    chapters = result.snapshot.chapters;
  const currentVolume = volumes.find((row) => Number(row.id) === bundle.volumeId);
  if (
    !currentVolume ||
    wikiUpdateSnapshotHash(readerWikiRow(currentVolume)) !== bundle.expectedVolumeSha256
  )
    throw new MangaEditorialConflict("Volume changed before canonical preparation");
  if (
    bundle.expectedChapter === null
      ? chapters.length !== 0
      : chapters.length !== 1 ||
        wikiUpdateSnapshotHash(readerWikiRow(chapters[0]!)) !== bundle.expectedChapterSha256
  )
    throw new MangaEditorialConflict(
      "Chapter presence or snapshot changed before canonical preparation",
    );
  if (!(await Bun.file(join(job, "backup.json")).exists())) {
    if (!options.backup) throw Error("Infra editorial backup capability missing");
    await options.backup(job);
  }
  await backupVerified(job);
  await once(join(job, "prepared.json"), prepared);
  return prepared;
}

/** Public assets are fetched and hashed by the importer before its locked canonical transaction. */
export async function applyMangaEditorial(
  prepared: PreparedMangaEditorial,
  options: MangaEditorialOptions = {},
) {
  const bundle = await pinned(prepared);
  const result = await invokeImporter(
    importerArgs(prepared, true),
    options.fetcher,
    prepared.mode,
    options,
  );
  if (!result || !("receipt" in result)) throw Error("Canonical importer receipt missing");
  const rows = result.snapshot.chapters.filter((row) => Number(row.volume_id) === bundle.volumeId);
  if (rows.length !== 1) throw Error("Canonical chapter readback is ambiguous");
  return { chapter: readerWikiRow(rows[0]!), receipt: result.receipt };
}

/** Replay validates the receipt, live complete snapshot and public bytes without a second edit. */
export async function verifyMangaEditorial(
  prepared: PreparedMangaEditorial,
  options: MangaEditorialOptions = {},
) {
  if (!(await Bun.file(join(prepared.job, "receipt.json")).exists()))
    throw Error("Editorial completion receipt missing");
  return applyMangaEditorial(prepared, options);
}
