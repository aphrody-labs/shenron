// SPDX-License-Identifier: Apache-2.0
import "server-only";
import {
  GIF_CATALOG_INDEX_URL,
  GIF_INDEX_URL,
  gifPage,
  gifQuery,
  parseGifIndex,
} from "./gif-catalog-contract";

/** Reads one bounded public projection, never the source video or the full frame corpus. */
export async function readGifIndex() {
  const options: RequestInit = {
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  };
  let response = await fetch(GIF_CATALOG_INDEX_URL, options);
  if (response.status === 404) {
    await response.body?.cancel();
    response = await fetch(GIF_INDEX_URL, options);
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (
    !response.ok ||
    !response.body ||
    !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")
  ) {
    await response.body?.cancel();
    throw new Error("GIF catalogue unavailable");
  }
  const maximum = 256 * 1024;
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!Number.isSafeInteger(Number(declared)) || Number(declared) < 1 || Number(declared) > maximum)
  ) {
    await response.body.cancel();
    throw new Error("GIF index exceeds budget");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum || chunks.length >= 4096) throw new Error("GIF index exceeds budget");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (declared !== null && !response.headers.has("content-encoding") && Number(declared) !== length)
    throw new Error("GIF index size differs");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return parseGifIndex(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function readGifCatalog(
  input: { page?: unknown; q?: unknown; revision?: unknown } = {},
) {
  const query = gifQuery(input);
  return gifPage(await readGifIndex(), query);
}

/** Exact downloads inspect the bounded index, independently of search pagination. */
export async function readGifByKey(key: string, revision?: string | null) {
  const query = gifQuery({ revision });
  const index = await readGifIndex();
  if (index && query.revision && index.revision !== query.revision)
    throw new Error("GIF revision changed");
  return index?.items.find((item) => item.key === key) ?? null;
}
