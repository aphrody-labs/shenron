// SPDX-License-Identifier: Apache-2.0
import { CDN_ORIGIN, SITE_URL } from "./config";
import { readerAssetUrl } from "./reader-assets";

export type StudioSource = { kind: "chapter" | "databook"; id: number; page: number };
export function studioSourceSelection(query: URLSearchParams): StudioSource | null {
  const kind = query.has("chapter") ? "chapter" : "databook";
  if (query.has("chapter") && query.has("databook")) return null;
  if (query.getAll(kind).length !== 1 || query.getAll("page").length !== 1) return null;
  const id = Number(query.get(kind));
  const page = Number(query.get("page"));
  return Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(page) && page > 0
    ? { kind, id, page }
    : null;
}

/** Only public owned image paths can cross the catalogue-to-editor boundary. */
export function studioSourceImage(value: string, origin: string): string {
  const url = new URL(readerAssetUrl(value), origin);
  if (
    ![origin, new URL(SITE_URL).origin, new URL(CDN_ORIGIN).origin].includes(url.origin) ||
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/(?:assets|wiki|media)\//.test(url.pathname) ||
    !/\.(?:png|jpe?g|webp|avif)$/i.test(url.pathname)
  )
    throw Error("Unapproved catalogue image");
  return url.href;
}

export function studioSourceRecord(source: StudioSource, value: unknown, origin: string) {
  if (!value || typeof value !== "object") throw Error("Invalid catalogue response");
  const row = value as Record<string, unknown>;
  let image: unknown;
  if (source.kind === "chapter") {
    const chapter = row.chapter as { id?: unknown; title?: unknown } | undefined;
    if (chapter?.id !== source.id || row.index !== source.page)
      throw Error("Catalogue page differs");
    image = row.image;
  } else {
    if (Number(row.id) !== source.id || !Array.isArray(row.pages))
      throw Error("Catalogue book differs");
    image = (row.pages as { number?: unknown; image?: unknown }[]).find(
      (page) => Number(page.number) === source.page,
    )?.image;
  }
  if (typeof image !== "string") throw Error("Catalogue page has no image");
  return {
    ...source,
    image: studioSourceImage(image, origin),
    name: `${source.kind}-${source.id}-page-${source.page}`,
  };
}

/** A streamed read keeps misleading or missing Content-Length bounded too. */
export async function studioSourceFile(url: string, signal: AbortSignal): Promise<File> {
  const response = await fetch(url, { signal, credentials: "omit", redirect: "error" });
  const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (
    !response.ok ||
    !response.body ||
    !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(mime)
  )
    throw Error("Catalogue image unavailable");
  const limit = 96 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit)
    throw Error("Catalogue image too large");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) throw Error("Catalogue image too large");
      chunks.push(new Uint8Array(next.value));
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (!size) throw Error("Empty catalogue image");
  return new File(chunks, `source.${mime === "image/jpeg" ? "jpg" : mime.split("/")[1]}`, {
    type: mime,
  });
}
