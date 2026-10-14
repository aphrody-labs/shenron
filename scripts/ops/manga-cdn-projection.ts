// SPDX-License-Identifier: Apache-2.0
/** Deterministic image/metadata allowlist over the existing public manga API, not a second editor. */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  validateMangaCdnIndex,
  mangaPublicationRoot,
  type CdnMangaChapter,
  type CdnMangaVolume,
  type MangaCdnIndex,
} from "../../apps/site/src/lib/manga-cdn-contract";
type Row = Record<string, any>;
export type MangaPublicSnapshot = {
  observedAt: string;
  declaredSeries: Row[];
  volumes: Row[];
  chapters: Row[];
};
type Asset = { sha256: string; size: number; contentType: string; sourcePath?: string };
export const mangaDigest = (body: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(body).digest("hex");
const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function projectMangaCdn(
  snapshot: MangaPublicSnapshot,
  inventory: Record<string, Asset>,
  inventorySha256: string,
  indexUrl: string,
) {
  const root = mangaPublicationRoot(indexUrl),
    artifacts = new Map<string, string>();
  const images = new Map<string, { path: string; originalPath: string; asset: Asset }>();
  if (!/^[a-f0-9]{64}$/.test(inventorySha256) || !Number.isFinite(Date.parse(snapshot.observedAt)))
    throw Error("A pinned public inventory and observed snapshot are required");
  function image(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "string") throw Error("Invalid public image reference");
    const url = new URL(raw.replace(/^\.\//, "/"), "https://dragonballfr.com");
    if (
      ![
        "https://dragonballfr.com",
        "https://cdn.dragonballfr.com",
        "https://bot.dragonballfr.com",
      ].includes(url.origin) ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw Error("An unqualified or variant image cannot enter the manga projection");
    const originalPath = decodeURIComponent(url.pathname),
      asset = inventory[originalPath];
    const extension = asset && mimeExtensions[asset.contentType.split(";")[0]!];
    if (
      !asset ||
      !extension ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 1
    )
      throw Error(`Image is not in the qualified public inventory: ${originalPath}`);
    const path = originalPath;
    images.set(path, { path, originalPath, asset });
    return new URL(path, "https://cdn.dragonballfr.com").href;
  }
  const volumes: CdnMangaVolume[] = snapshot.volumes
    .map((row) => ({
      id: row.id,
      series: row.series,
      volume_number: row.volume_number,
      title: row.title ?? null,
      cover: image(row.cover),
      title_ja: row.title_ja ?? null,
      published_at: row.published_at ?? null,
      isbn: row.isbn ?? null,
      source_url: row.source_url ?? null,
      source_label: row.source_label ?? null,
    }))
    .toSorted((a, b) => a.id - b.id);
  const chapters: CdnMangaChapter[] = snapshot.chapters
    .map((row) => {
      if (!Array.isArray(row.pageList) || row.pages !== row.pageList.length || !row.pageList.length)
        throw Error("Incomplete canonical chapter response");
      const pages = row.pageList.map((page: Row) => image(page.image));
      if (pages.some((page: string | null) => page === null))
        throw Error("A public reader page lacks an image");
      return {
        id: row.id,
        series: row.series,
        chapter_number: row.chapter_number,
        title: row.title ?? null,
        volume_id: row.volume_id ?? null,
        cover: image(row.cover) ?? pages[0]!,
        pages: pages as string[],
      };
    })
    .toSorted((a, b) => a.id - b.id);
  for (const series of snapshot.declaredSeries) {
    const found = chapters.filter((chapter) => chapter.series === series.series);
    if (
      found.length !== series.chapters ||
      found.reduce((n, chapter) => n + chapter.pages.length, 0) !== series.pages
    )
      throw Error("The exported reader enumeration differs from the canonical public counts");
  }
  const descriptor = chapters.map((chapter) => {
    const body = JSON.stringify(chapter),
      sha256 = mangaDigest(body),
      url = root + `objects/${sha256}.json`;
    artifacts.set(new URL(url).pathname, body);
    return {
      id: chapter.id,
      series: chapter.series,
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      volume_id: chapter.volume_id,
      cover: chapter.cover,
      page_count: chapter.pages.length,
      previewPages: chapter.pages.slice(0, 3),
      url,
      sha256,
    };
  });
  const volumeChapters = Object.fromEntries(
    snapshot.volumes.map((volume) => [
      String(volume.id),
      (volume.chapters ?? []).map((chapter: Row) => chapter.id),
    ]),
  );
  const revision = mangaDigest(
    JSON.stringify({
      assetInventorySha256: inventorySha256,
      volumes,
      chapters: descriptor,
      volumeChapters,
    }),
  );
  const index: MangaCdnIndex = {
    schema: "shenron-manga-cdn/v1",
    revision,
    observedAt: snapshot.observedAt,
    assetInventorySha256: inventorySha256,
    volumes,
    chapters: descriptor,
    volumeChapters,
  };
  validateMangaCdnIndex(index, indexUrl);
  const body = JSON.stringify(index);
  if (new TextEncoder().encode(body).length > 2 * 1024 * 1024)
    throw Error("Manga index exceeds the publication bound");
  artifacts.set(new URL(indexUrl).pathname, body);
  return { index, indexSha256: mangaDigest(body), artifacts, images: [...images.values()] };
}

/** Public source collection remains bounded; no credentials, SQL or writes to the editor. */
export async function collectPublicMangaSnapshot(
  origin: string,
  fetcher: typeof fetch = fetch,
): Promise<MangaPublicSnapshot> {
  if (new URL(origin).origin !== "https://dragonballfr.com")
    throw Error("Only the canonical public API may feed the snapshot");
  const json = async (path: string) => {
    const response = await fetcher(new URL(path, origin), {
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`Public manga source unavailable (${response.status})`);
    return response.json();
  };
  const entry = await json("/api/manga");
  if (
    !Array.isArray(entry.catalog) ||
    !Array.isArray(entry.series) ||
    entry.catalog.length < 1 ||
    entry.catalog.length > 10000
  )
    throw Error("Invalid canonical manga catalogue");
  async function pool<T, U>(items: T[], read: (item: T) => Promise<U>): Promise<U[]> {
    const results: U[] = [];
    let at = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (at < items.length) {
          const index = at++;
          results[index] = await read(items[index]!);
        }
      }),
    );
    return results;
  }
  const volumes = await pool<Row, Row>(entry.catalog, (volume) =>
    json(`/api/manga/volume/${volume.id}`),
  );
  const ids = [
    ...new Set<number>(
      volumes.flatMap((volume) =>
        (volume.chapters ?? []).map((chapter: Row) => Number(chapter.id)),
      ),
    ),
  ];
  if (ids.length < 1 || ids.length > 10000 || ids.some((id) => !Number.isSafeInteger(id) || id < 1))
    throw Error("Invalid public reader identity enumeration");
  const chapters = await pool(ids, (id) => json(`/api/manga/chapter/${id}`));
  const final = await json("/api/manga");
  if (!Bun.deepEquals(entry, final))
    throw Error("The canonical catalogue changed during collection");
  return { observedAt: new Date().toISOString(), declaredSeries: entry.series, volumes, chapters };
}

/** Stage JSON only; the existing image corpus is referenced and never copied or aliased. */
export async function stageMangaCdnProjection(
  projection: ReturnType<typeof projectMangaCdn>,
  output: string,
) {
  const target = resolve(output);
  await mkdir(target, { recursive: false, mode: 0o700 });
  for (const [path, body] of projection.artifacts)
    await Bun.write(join(target, path.slice(1)), body);
  return {
    revision: projection.index.revision,
    indexSha256: projection.indexSha256,
    imageAliases: 0,
    referencedImages: projection.images.length,
    newRasterCopies: 0,
    objects: projection.artifacts.size,
  };
}
