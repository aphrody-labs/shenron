// SPDX-License-Identifier: Apache-2.0
import { lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  mangaBundleSchema,
  type MangaBundle,
} from "../../packages/pipeline/src/dragon-ball/manga-publication-contract";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";
import { validateAssetPath } from "./public-cdn-catalog";
import { mangaDigest } from "./manga-cdn-projection";
import {
  crawlIngestPolicySchema,
  nativeDocumentSchema,
  readNativeCrawlDocuments,
} from "../../packages/pipeline/src/dragon-ball/crawl-ingest";
import type { SourcePipelineConfig } from "./bun-source-pipeline";
const isbn = (value: unknown) => String(value ?? "").replace(/[-\s]/g, "");
export async function pinnedFile(
  pin: { path: string; sha256: string },
  maximum = 16 * 1024 * 1024,
) {
  const info = await lstat(pin.path);
  if (!isAbsolute(pin.path) || !info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw Error("Invalid bounded pinned file");
  const bytes = await Bun.file(pin.path).bytes();
  if (mangaDigest(bytes) !== pin.sha256) throw Error("Pinned input changed");
  return bytes;
}
/** A bibliography record cannot supply page URLs: each image must occur in the pinned native capture. */
export async function qualifyBundle(value: unknown): Promise<MangaBundle> {
  const bundle = mangaBundleSchema.parse(value);
  if (
    wikiUpdateSnapshotHash(bundle.expectedVolume) !== bundle.expectedVolumeSha256 ||
    (bundle.expectedChapter !== null &&
      wikiUpdateSnapshotHash(bundle.expectedChapter) !== bundle.expectedChapterSha256)
  )
    throw Error("Complete administrative snapshot hash differs");
  const v = bundle.expectedVolume,
    c = bundle.expectedChapter;
  if (
    v.id !== bundle.volumeId ||
    v.series !== bundle.series ||
    v.volumeNumber !== bundle.volumeNumber ||
    isbn(v.isbn) !== isbn(bundle.isbn) ||
    !/^\d{13}$/.test(isbn(bundle.isbn)) ||
    (c === null
      ? bundle.chapterId !== null || bundle.expectedChapterSha256 !== null || !bundle.activate
      : bundle.chapterId === null ||
        bundle.expectedChapterSha256 === null ||
        c.id !== bundle.chapterId ||
        c.series !== bundle.series ||
        c.volumeId !== bundle.volumeId ||
        c.chapterNumber !== bundle.chapterNumber ||
        (!c.visible && !bundle.activate)) ||
    v.visible !== true
  )
    throw Error("Manga publication identity or visibility differs");
  if (c && c.visible === false && Array.isArray(c.pages) && c.pages.length > 0)
    throw Error("An existing hidden reader requires its editorial visibility owner");
  const paths = new Set<string>(),
    sources = new Set<string>();
  if (!bundle.pages.some((page) => page.kind === "manga"))
    throw Error("Cover-only media cannot activate a manga reader");
  for (const page of bundle.pages) {
    validateAssetPath(page.publicPath);
    if (
      !page.publicPath.startsWith("/assets/manga/") ||
      paths.has(page.publicPath) ||
      sources.has(page.sourceUrl)
    )
      throw Error("Manga pages require distinct public assets and source URLs");
    paths.add(page.publicPath);
    sources.add(page.sourceUrl);
  }
  const config = JSON.parse(
    new TextDecoder().decode(await pinnedFile(bundle.source.config)),
  ) as SourcePipelineConfig;
  if (
    config.input !== bundle.source.input.path ||
    config.policy !== bundle.source.policy.path ||
    config.media !== bundle.source.media.path ||
    config.crawl ||
    (config as unknown as Record<string, unknown>).search ||
    config.delivery ||
    config.publication ||
    !config.store
  )
    throw Error("Source owner requires pinned private acquisition, provenance and store inputs");
  await pinnedFile(bundle.source.input, 256 * 1024 * 1024);
  const policy = crawlIngestPolicySchema.parse(
    JSON.parse(new TextDecoder().decode(await pinnedFile(bundle.source.policy))),
  );
  const media = JSON.parse(
    new TextDecoder().decode(await pinnedFile(bundle.source.media)),
  ) as unknown;
  if (!Array.isArray(media) || media.length !== bundle.pages.length)
    throw Error("Exact source media inventory required");
  for (const page of bundle.pages) {
    const item = media.find((entry) => entry?.url === page.sourceUrl);
    const rights = policy.sources.find(
      (entry) => entry.domain === new URL(page.sourceUrl).hostname,
    )?.rights;
    if (
      !item ||
      item.publicPath !== undefined ||
      item.sha256 !== page.sha256 ||
      item.size !== page.size ||
      item.contentType !== page.contentType ||
      !rights?.publicImagesPermitted
    )
      throw Error("Source media identity or existing publication rights differ");
  }
  let identityFound = false;
  const discovered = new Set<string>();
  let count = 0;
  for await (const capture of readNativeCrawlDocuments(config.input)) {
    if (++count > 10000) throw Error("Native capture document budget exceeded");
    const document = nativeDocumentSchema.parse(capture);
    if (document.canonical_url !== bundle.source.documentUrl) continue;
    if (
      document.http_status !== 200 ||
      !policy.sources.some((entry) => entry.domain === document.source_domain)
    )
      throw Error("Source identity capture is unavailable or outside source policy");
    const text = document.payload.title_raw + "\n" + document.payload.body_markdown;
    identityFound =
      text.includes(bundle.source.editionToken) &&
      text.includes(bundle.source.volumeToken) &&
      text.includes(bundle.source.isbnToken) &&
      isbn(bundle.source.isbnToken) === isbn(bundle.isbn);
    for (const embedded of document.payload.embedded_media)
      if (embedded.type === "image") discovered.add(embedded.url);
  }
  if (!identityFound || bundle.pages.some((page) => !discovered.has(page.sourceUrl)))
    throw Error(
      "Edition, volume, ISBN and every image must be present in the pinned source capture",
    );
  return bundle;
}
