// SPDX-License-Identifier: Apache-2.0
export const GIF_SOURCE_SHA256 = "db6b365d58a933a18176ffd848b23d79513acb899acf7b4a07bd35203949508e";
export const GIF_ASSET_BASE = `https://cdn.dragonballfr.com/media/episodes/875/${GIF_SOURCE_SHA256}/`;
export const GIF_INDEX_URL = `${GIF_ASSET_BASE}gifs/index.json`;
export const GIF_CATALOG_INDEX_URL = "https://cdn.dragonballfr.com/catalog/gifs/index.json";
export const GIF_PAGE_SIZE = 12;
export const GIF_MAX_ITEMS = 64;
export type PublicGif = {
  id: string;
  key: string;
  episodeId: number;
  sourceSha256: string;
  gifUrl: string;
  posterUrl: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  posterSha256: string;
  startSeconds: number;
  durationSeconds: number;
};
export type GifIndex = {
  schema: "shenron-public-gifs/v1";
  revision: string;
  qualified: true;
  items: PublicGif[];
};
export type GifPage = {
  available: boolean;
  revision: string | null;
  page: number;
  pages: number;
  total: number;
  query: string;
  items: PublicGif[];
};
const hex = /^[a-f0-9]{64}$/;

function safeUrl(value: unknown, kind: "gif" | "poster", base: string): value is string {
  if (typeof value !== "string" || !value.startsWith(base) || value.length > 2048) return false;
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const suffix = value.slice(base.length);
  return (
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password &&
    url.href === value &&
    (kind === "gif"
      ? /^gifs\/[a-z0-9-]+\.gif$/
      : /^(?:storyboard|frames)\/[a-z0-9-]+\.(?:png|webp|jpe?g)$/
    ).test(suffix)
  );
}

/** A publication receipt must qualify every public GIF and its static preview before this index exists. */
export function parseGifIndex(value: unknown): GifIndex {
  if (!value || typeof value !== "object") throw new Error("Invalid GIF index");
  const input = value as GifIndex & { episodeId?: number; sourceSha256?: string };
  if (
    input.schema !== "shenron-public-gifs/v1" ||
    input.qualified !== true ||
    !hex.test(input.revision) ||
    !Array.isArray(input.items) ||
    input.items.length > GIF_MAX_ITEMS
  )
    throw new Error("Unqualified GIF index");
  const seen = new Set<string>();
  const items = input.items.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid public GIF artifact");
    const episodeId = item.episodeId ?? input.episodeId;
    const sourceSha256 = item.sourceSha256 ?? input.sourceSha256;
    if (
      !Number.isSafeInteger(episodeId) ||
      episodeId! < 1 ||
      episodeId! > 2147483647 ||
      typeof sourceSha256 !== "string" ||
      !hex.test(sourceSha256)
    )
      throw new Error("Invalid GIF episode provenance");
    const key = `${episodeId}-${item.id}`;
    const base = `https://cdn.dragonballfr.com/media/episodes/${episodeId}/${sourceSha256}/`;
    if (
      typeof item.id !== "string" ||
      !/^[a-z0-9-]{1,80}$/.test(item.id) ||
      seen.has(key) ||
      !safeUrl(item.gifUrl, "gif", base) ||
      !safeUrl(item.posterUrl, "poster", base) ||
      item.gifUrl !== `${base}gifs/${item.id}.gif` ||
      !hex.test(item.sha256) ||
      !hex.test(item.posterSha256) ||
      !Number.isSafeInteger(item.width) ||
      !Number.isSafeInteger(item.height) ||
      item.width < 1 ||
      item.height < 1 ||
      item.width > 4096 ||
      item.height > 4096 ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 1 ||
      item.bytes > 20 * 1024 * 1024 ||
      !Number.isFinite(item.startSeconds) ||
      item.startSeconds < 0 ||
      !Number.isFinite(item.durationSeconds) ||
      item.durationSeconds <= 0 ||
      item.durationSeconds > 30
    )
      throw new Error("Invalid public GIF artifact");
    seen.add(key);
    // An allowlist strips private paths, producer sessions and unreviewed semantic titles.
    return {
      id: item.id,
      key,
      episodeId: episodeId!,
      sourceSha256,
      gifUrl: item.gifUrl,
      posterUrl: item.posterUrl,
      width: item.width,
      height: item.height,
      bytes: item.bytes,
      sha256: item.sha256,
      posterSha256: item.posterSha256,
      startSeconds: item.startSeconds,
      durationSeconds: item.durationSeconds,
    };
  });
  return { schema: input.schema, revision: input.revision, qualified: true, items };
}

export function gifQuery(input: { page?: unknown; q?: unknown; revision?: unknown }) {
  const text = typeof input.q === "string" ? input.q.trim().slice(0, 96) : "";
  const rawPage = String(input.page ?? "1");
  if (!/^[1-9]\d{0,4}$/.test(rawPage)) throw new Error("Invalid GIF page");
  const revision =
    input.revision === undefined || input.revision === null || input.revision === ""
      ? null
      : String(input.revision);
  if (revision && !hex.test(revision)) throw new Error("Invalid GIF revision");
  return { page: Number(rawPage), query: text, revision };
}

export function gifPage(index: GifIndex | null, input: ReturnType<typeof gifQuery>): GifPage {
  if (index && input.revision && index.revision !== input.revision)
    throw new Error("GIF revision changed");
  const query = input.query.toLocaleLowerCase("fr");
  const items = (index?.items ?? []).filter(
    (item) => !query || item.key.includes(query) || String(item.startSeconds).includes(query),
  );
  const pages = Math.max(1, Math.ceil(items.length / GIF_PAGE_SIZE));
  const page = Math.min(input.page, pages);
  return {
    available: index !== null,
    revision: index?.revision ?? null,
    page,
    pages,
    total: items.length,
    query: input.query,
    items: items.slice((page - 1) * GIF_PAGE_SIZE, page * GIF_PAGE_SIZE),
  };
}

export function gifTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
