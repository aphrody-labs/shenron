// SPDX-License-Identifier: Apache-2.0
import { chmod, lstat, mkdir, rename } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { Database } from "bun:sqlite";
import {
  mangaCandidateSchema,
  type MangaCandidate,
  type MangaBundle,
} from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
import { crawlIngestPolicySchema } from "../../packages/pipeline/src/dragon-ball/crawl-ingest";
import { acquire, type AcquiredSource } from "./lib/bun-source-http";
import { mangaDigest } from "./manga-cdn-projection";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import { qualifyBundle } from "./manga-publication-worker";
import type { SourcePipelineConfig } from "./bun-source-pipeline";

type Row = Record<string, unknown>;
export interface MangaPlannerPorts {
  locate(candidate: MangaCandidate): Promise<{ volume: Row; chapter: Row | null }>;
  acquire(url: string, allowedOrigins: string[], maxBytes: number): Promise<AcquiredSource>;
}
export const nativeMangaPlannerPorts = (
  signal?: AbortSignal,
  poolJob?: string,
): MangaPlannerPorts => ({
  locate: async (candidate) => {
    const origin = "https://dragonballfr.com";
    const token = process.env.SHENRON_API_ADMIN_TOKEN;
    if (!token) throw Error("Authorized catalogue credential missing");
    const json = async (path: string, admin: boolean) => {
      const response = await fetch(origin + path, {
        redirect: "error",
        cache: "no-store",
        headers: admin ? { authorization: "Bearer " + token } : {},
        signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
      });
      if (!response.ok) throw Error("Canonical identity catalogue unavailable");
      return response.json();
    };
    const catalogue = await json("/api/manga", false);
    const normalize = (value: unknown) => String(value ?? "").replace(/[-\s]/g, "");
    const matches = catalogue.catalog.filter(
      (row: Row) =>
        row.series === candidate.series &&
        row.number === candidate.volumeNumber &&
        normalize(row.isbn) === normalize(candidate.isbn),
    );
    if (matches.length !== 1)
      throw Error("Exact existing publication identity is ambiguous or absent");
    const volume = await json("/api/wiki-admin/db_manga_volumes/" + matches[0].id, true);
    const chapters = await json(
      `/api/wiki-admin/db_manga_chapters?as=byParent&col=volumeId&id=${volume.id}`,
      true,
    );
    const slots = chapters.rows.filter(
      (row: Row) =>
        row.series === candidate.series && row.chapterNumber === candidate.chapterNumber,
    );
    if (slots.length > 1 || (slots.length === 0 && chapters.rows.length > 0))
      throw Error("Exact chapter slot is ambiguous or another reader exists");
    const chapter = slots.length
      ? await json("/api/wiki-admin/db_manga_chapters/" + slots[0].id, true)
      : null;
    return { volume, chapter };
  },
  acquire: async (url, allowedOrigins, maxBytes) => {
    if (poolJob) {
      const database = new Database(join(poolJob, "frontier.sqlite"), { readonly: true });
      try {
        const task = database
          .query<{ receipt: string }, [string]>(
            "SELECT receipt FROM pool_tasks WHERE kind='acquisition' AND state='done' AND url=?",
          )
          .get(url);
        if (!task) throw Error("Canonical source pool has no acquired bytes for this image yet");
        const receipt = await Bun.file(task.receipt).json();
        const path = resolve(receipt.assetPath),
          within = relative(join(resolve(poolJob), "acquired"), path);
        if (
          within.startsWith("..") ||
          isAbsolute(within) ||
          receipt.sourceUrl !== url ||
          receipt.httpStatus !== 200 ||
          !allowedOrigins.includes(new URL(url).origin)
        )
          throw Error("Source pool receipt identity differs");
        const info = await lstat(path),
          bytes = await Bun.file(path).bytes();
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          bytes.length > maxBytes ||
          bytes.length !== receipt.bytes ||
          mangaDigest(bytes) !== receipt.sha256
        )
          throw Error("Source pool acquired bytes differ");
        return {
          bytes,
          status: 200,
          contentType: receipt.contentType,
          sha256: receipt.sha256,
          finalUrl: url,
        };
      } finally {
        database.close();
      }
    }
    return acquire(url, { transport: "fetch", allowedOrigins, maxBytes, timeoutMs: 30000, signal });
  },
});
async function pinned(pin: { path: string; sha256: string }, max = 256 * 1024 * 1024) {
  const info = await lstat(pin.path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max)
    throw Error("Invalid candidate pinned file");
  const bytes = await Bun.file(pin.path).bytes();
  if (mangaDigest(bytes) !== pin.sha256) throw Error("Candidate pinned file changed");
  return bytes;
}
async function write(path: string, value: unknown) {
  const body = JSON.stringify(value, null, 2);
  await Bun.write(path + ".next", body);
  await chmod(path + ".next", 0o600);
  await rename(path + ".next", path);
  return { path, sha256: mangaDigest(body) };
}
function raster(bytes: Uint8Array, mime: string) {
  return mime === "image/png"
    ? bytes.length > 24 && bytes[0] === 137 && new TextDecoder().decode(bytes.slice(1, 4)) === "PNG"
    : mime === "image/jpeg"
      ? bytes.length > 4 &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes.at(-2) === 255 &&
        bytes.at(-1) === 217
      : mime === "image/webp" &&
        bytes.length > 16 &&
        new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

/** Automatically pins acquired bytes and fresh canonical snapshots; unsupported identities stay in quarantine. */
export async function planMangaAcquisition(
  value: unknown,
  job: string,
  outbox: string,
  ports = nativeMangaPlannerPorts(),
  maxFiles = 100,
  maxBytes = 64 * 1024 * 1024,
) {
  const candidate = mangaCandidateSchema.parse(value);
  if (!candidate.pages.some((page) => page.kind === "manga"))
    throw Error("Cover-only source is not a manga scan set");
  if (candidate.expectedImages !== null && candidate.pages.length > candidate.expectedImages)
    throw Error("Observed images exceed source enumeration");
  const template = JSON.parse(
    new TextDecoder().decode(await pinned(candidate.source.config)),
  ) as SourcePipelineConfig;
  await pinned(candidate.source.input);
  const policy = crawlIngestPolicySchema.parse(
    JSON.parse(new TextDecoder().decode(await pinned(candidate.source.policy))),
  );
  const allowedOrigins = policy.sources
    .filter((source) => source.rights.publicImagesPermitted)
    .map((source) => "https://" + source.domain);
  const identity = mangaDigest(JSON.stringify(candidate)),
    root = join(job, "acquisitions", identity);
  await mkdir(join(root, "objects"), { recursive: true, mode: 0o700 });
  let files = 0,
    bytes = 0;
  const pages: MangaBundle["pages"] = [];
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  for (const page of candidate.pages) {
    if (!allowedOrigins.includes(new URL(page.sourceUrl).origin))
      throw Error("Image source has no existing publication grant");
    const reference = join(root, "reference-" + mangaDigest(page.sourceUrl) + ".json");
    let acquired: { sha256: string; size: number; contentType: string };
    if (await Bun.file(reference).exists()) {
      acquired = await Bun.file(reference).json();
      const body = await Bun.file(join(root, "objects", acquired.sha256)).bytes();
      if (
        body.length !== acquired.size ||
        mangaDigest(body) !== acquired.sha256 ||
        !raster(body, acquired.contentType)
      )
        throw Error("Acquisition checkpoint bytes changed");
    } else {
      if (files >= maxFiles || bytes >= maxBytes)
        return { complete: false as const, identity, reason: "cycle-budget" };
      const result = await ports.acquire(
        page.sourceUrl,
        allowedOrigins,
        Math.min(33 * 1024 * 1024, maxBytes - bytes),
      );
      const contentType = result.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (
        result.status !== 200 ||
        result.finalUrl !== page.sourceUrl ||
        !extensions[contentType] ||
        !raster(result.bytes, contentType) ||
        mangaDigest(result.bytes) !== result.sha256
      )
        throw Error("Actual source raster, SHA or identity differs");
      acquired = { sha256: result.sha256, size: result.bytes.length, contentType };
      await Bun.write(join(root, "objects", acquired.sha256), result.bytes);
      await chmod(join(root, "objects", acquired.sha256), 0o600);
      await write(reference, acquired);
      files++;
      bytes += acquired.size;
    }
    pages.push({
      ...page,
      ...acquired,
      contentType: acquired.contentType as MangaBundle["pages"][number]["contentType"],
      publicPath: `/assets/manga/${candidate.series}/vol${candidate.volumeNumber}/${acquired.sha256}.${extensions[acquired.contentType]}`,
    });
  }
  // Printed pagination and image/spread enumeration are retained separately, never equated.
  await write(join(root, "coverage.json"), {
    expectedImages: candidate.expectedImages,
    acquiredImages: pages.length,
    printedPages: candidate.pages.map((page) => page.printedPages),
    status: "partial-until-independent-pagination-audit",
  });
  const media = await write(
    join(root, "media.json"),
    pages.map((page) => ({
      url: page.sourceUrl,
      sha256: page.sha256,
      size: page.size,
      contentType: page.contentType,
    })),
  );
  const config = await write(join(root, "source-config.json"), {
    ...template,
    input: candidate.source.input.path,
    policy: candidate.source.policy.path,
    media: media.path,
    crawl: undefined,
    search: undefined,
    delivery: undefined,
    autoMedia: false,
    job: join(root, "source"),
    publication: undefined,
  });
  const sourceRevision = mangaDigest(
    JSON.stringify([
      config.sha256,
      candidate.source.input.sha256,
      candidate.source.policy.sha256,
      media.sha256,
    ]),
  );
  const cache = join(root, "source", "revisions", sourceRevision);
  await mkdir(join(cache, "objects"), { recursive: true, mode: 0o700 });
  for (const page of pages) {
    await Bun.write(
      join(cache, "objects", page.sha256),
      Bun.file(join(root, "objects", page.sha256)),
    );
    await chmod(join(cache, "objects", page.sha256), 0o600);
    await write(join(cache, "reference-" + mangaDigest(page.sourceUrl) + ".json"), {
      sourceUrlSha256: mangaDigest(page.sourceUrl),
      sha256: page.sha256,
      size: page.size,
      contentType: page.contentType,
    });
  }
  const { volume, chapter } = await ports.locate(candidate);
  const bundle = await qualifyBundle({
    schema: "shenron-manga-publication-bundle/v1",
    series: candidate.series,
    volumeId: volume.id,
    volumeNumber: candidate.volumeNumber,
    chapterId: chapter?.id ?? null,
    chapterNumber: candidate.chapterNumber,
    isbn: candidate.isbn,
    activate: true,
    expectedVolume: volume,
    expectedVolumeSha256: wikiUpdateSnapshotHash(volume),
    expectedChapter: chapter,
    expectedChapterSha256: chapter ? wikiUpdateSnapshotHash(chapter) : null,
    source: { ...candidate.source, config, media },
    pages,
  });
  await mkdir(outbox, { recursive: true, mode: 0o700 });
  const output = join(outbox, identity + ".json");
  // A successful candidate remains pinned: later staff edits require another source revision.
  if (!(await Bun.file(output).exists())) await write(output, bundle);
  return { complete: true as const, identity, output };
}
