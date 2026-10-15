// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";

export const MANGA_REVALIDATION_SCHEMA = "shenron-manga-revalidation/v1";
export const MANGA_REVALIDATION_CAPABILITIES = {
  schema: MANGA_REVALIDATION_SCHEMA,
  action: "capabilities",
  maxPages: 2500,
  maxBodyBytes: 1024,
  digest: "sha256-json-array-v1",
  sourceCacheMaxAgeMs: 30000,
  regeneration: "next-visit",
  edgeCacheInvalidated: false,
} as const;

export type MangaRevalidation = {
  schema: typeof MANGA_REVALIDATION_SCHEMA;
  action: "revalidate";
  volumeId: number;
  chapterId: number;
  pageCount: number;
  pagesSha256: string;
  indexSha256: string;
};
export class MangaRevalidationError extends Error {
  constructor(
    readonly status: 400 | 409 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Order and absolute reader URLs are part of the publication identity. */
export function mangaPublicationPagesDigest(pages: readonly string[]) {
  return createHash("sha256").update(JSON.stringify(pages)).digest("hex");
}

export function parseMangaRevalidation(
  value: unknown,
): MangaRevalidation | { schema: typeof MANGA_REVALIDATION_SCHEMA; action: "capabilities" } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new MangaRevalidationError(400, "invalid_manga_revalidation");
  const row = value as Record<string, unknown>;
  const keys =
    row.action === "capabilities"
      ? ["schema", "action"]
      : ["schema", "action", "volumeId", "chapterId", "pageCount", "pagesSha256", "indexSha256"];
  if (
    row.schema !== MANGA_REVALIDATION_SCHEMA ||
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key)) ||
    (row.action !== "capabilities" && row.action !== "revalidate")
  )
    throw new MangaRevalidationError(400, "invalid_manga_revalidation");
  if (row.action === "capabilities")
    return { schema: MANGA_REVALIDATION_SCHEMA, action: "capabilities" };
  if (
    !positive(row.volumeId) ||
    !positive(row.chapterId) ||
    !positive(row.pageCount) ||
    row.pageCount > MANGA_REVALIDATION_CAPABILITIES.maxPages ||
    !digest(row.pagesSha256) ||
    !digest(row.indexSha256)
  )
    throw new MangaRevalidationError(400, "invalid_manga_revalidation");
  return row as MangaRevalidation;
}

/** Bound the actual stream, including requests with missing or false Content-Length. */
export async function readMangaRevalidation(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    throw new MangaRevalidationError(415, "json_required");
  const reader = request.body?.getReader();
  if (!reader) throw new MangaRevalidationError(400, "invalid_manga_revalidation");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MANGA_REVALIDATION_CAPABILITIES.maxBodyBytes)
        throw new MangaRevalidationError(413, "manga_revalidation_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    const body = await new Blob(chunks.map((chunk) => new Uint8Array(chunk))).text();
    return parseMangaRevalidation(JSON.parse(body));
  } catch (error) {
    if (error instanceof MangaRevalidationError) throw error;
    throw new MangaRevalidationError(400, "invalid_manga_revalidation");
  }
}

export interface MangaRevalidationSource {
  mangaVolume(id: number): Promise<{
    id: number;
    series: string;
    chapters: { id: number }[];
  } | null>;
  mangaChapter(id: number): Promise<{
    id: number;
    volume_id: number | null;
    series: string;
    pages: string[];
    prev: number | null;
    next: number | null;
  } | null>;
}

/** Validate the qualified CDN reader, never the editorial fallback, before invalidating Next. */
export async function revalidateMangaPublication(
  input: MangaRevalidation,
  ports: {
    refresh(indexSha256: string): Promise<MangaRevalidationSource>;
    revalidatePath(path: string): void;
  },
) {
  const parsed = parseMangaRevalidation(input);
  if (parsed.action !== "revalidate") throw new MangaRevalidationError(400, "invalid_action");
  const source = await ports.refresh(input.indexSha256);
  const [volume, chapter] = await Promise.all([
    source.mangaVolume(input.volumeId),
    source.mangaChapter(input.chapterId),
  ]);
  if (
    !volume ||
    !chapter ||
    volume.id !== input.volumeId ||
    chapter.id !== input.chapterId ||
    chapter.volume_id !== volume.id ||
    volume.series !== chapter.series ||
    !volume.chapters.some((row) => row.id === chapter.id) ||
    chapter.pages.length !== input.pageCount ||
    mangaPublicationPagesDigest(chapter.pages) !== input.pagesSha256 ||
    [chapter.prev, chapter.next].some((id) => id !== null && !positive(id))
  )
    throw new MangaRevalidationError(409, "manga_publication_differs");
  const paths = new Set([
    "/wiki/manga",
    "/api/manga",
    "/api/manga/search",
    `/wiki/manga/volume/${volume.id}`,
    `/api/manga/volume/${volume.id}`,
  ]);
  for (const id of new Set([chapter.id, chapter.prev, chapter.next])) {
    if (id === null) continue;
    paths.add(`/wiki/manga/${id}`);
    paths.add(`/api/manga/chapter/${id}`);
  }
  for (let page = 1; page <= input.pageCount; page++)
    paths.add(`/api/manga/chapter/${chapter.id}/pages/${page}`);
  for (const path of paths) ports.revalidatePath(path);
  return {
    ...input,
    action: "revalidated" as const,
    paths: [...paths],
    regeneration: "next-visit" as const,
    localSourceCache: "refreshed" as const,
    edgeCacheInvalidated: false as const,
  };
}
