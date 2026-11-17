// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { catalogPageNumber } from "./catalog-explorer-contract";

export type PublicAsset = { path: string; mime: string; size: number; sha256: string | null };
type Descriptor = { url: string; count: number; sha256: string };
export type CdnIndex = {
  schema: string;
  revision: string;
  observedAt: string;
  inventorySha256: string;
  totalFiles: number;
  totalBytes: number;
  totalFolders: number;
  pageSize: number;
  files: { pages: Descriptor[] };
  folders: { shardTemplate: string; shards: Record<string, string> };
};
export type CdnPage = {
  revision: string;
  path: string | null;
  page: number;
  totalPages: number;
  entries: PublicAsset[];
};
export type CdnDirectory = {
  path: string;
  fileCount: number;
  directoryCount: number;
  pages: Descriptor[];
};
const hex = /^[a-f0-9]{64}$/;
const base = DEFAULT_PUBLIC_ORIGINS.cdn;
export function safeCdnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 8192) return false;
  try {
    let decoded = path;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (
        /[\\?#]/.test(decoded) ||
        [...decoded].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
        decoded.startsWith("//") ||
        decoded.split("/").some((part) => part === ".." || part === ".")
      )
        return false;
      const next = decodeURIComponent(decoded);
      if (next === decoded) return true;
      decoded = next;
    }
    return false;
  } catch {
    return false;
  }
}
async function sha(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
async function readJson<T>(path: string, expected?: string): Promise<T> {
  if (!safeCdnPath(path) || !path.startsWith("/catalog/assets/"))
    throw new Error("Unsafe CDN projection path");
  const response = await fetch(new URL(path, base), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`CDN catalogue unavailable (${response.status})`);
  const limit = 8 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("CDN projection too large");
  }
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("CDN projection too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (expected && (!hex.test(expected) || (await sha(bytes)) !== expected))
    throw new Error("CDN projection integrity differs");
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
export async function readCdnIndex(): Promise<CdnIndex> {
  const index = await readJson<CdnIndex>("/catalog/assets/index.json");
  if (
    index.schema !== "shenron-public-cdn/v1" ||
    !hex.test(index.revision) ||
    !hex.test(index.inventorySha256) ||
    !Array.isArray(index.files?.pages) ||
    index.files.pages.length > 100_000 ||
    index.pageSize < 1 ||
    index.pageSize > 200 ||
    !index.folders?.shards ||
    index.folders.shardTemplate !==
      `/catalog/assets/revisions/${index.revision}/directories/{shard}.json`
  )
    throw new Error("Unsupported CDN projection");
  return index;
}
/** Index read per request; immutable pages are always pinned to that revision. */
export async function readCdnPage(
  input: { path?: string; page?: unknown; all?: boolean } = {},
): Promise<{ index: CdnIndex; directory: CdnDirectory | null; page: CdnPage }> {
  const index = await readCdnIndex();
  const path = input.path ?? "/";
  if (!safeCdnPath(path) || !path.endsWith("/")) throw new Error("Invalid CDN directory");
  let directory: CdnDirectory | null = null;
  let descriptors = index.files.pages;
  if (!input.all) {
    const shard = (await sha(new TextEncoder().encode(path))).slice(0, 2);
    const lookup = await readJson<Record<string, CdnDirectory>>(
      index.folders.shardTemplate.replace("{shard}", shard),
      index.folders.shards[shard],
    );
    directory = Object.hasOwn(lookup, path) ? lookup[path]! : null;
    if (!directory || directory.path !== path || !Array.isArray(directory.pages))
      throw new Error("CDN directory not found");
    descriptors = directory.pages;
  }
  const pageNumber = catalogPageNumber(input.page);
  const descriptor = descriptors[pageNumber - 1];
  if (!descriptor) throw new Error("CDN page not found");
  if (
    !descriptor.url.startsWith(`/catalog/assets/revisions/${index.revision}/`) ||
    !hex.test(descriptor.sha256)
  )
    throw new Error("CDN descriptor differs");
  const page = await readJson<CdnPage>(descriptor.url, descriptor.sha256);
  if (
    page.revision !== index.revision ||
    page.path !== (input.all ? null : path) ||
    page.page !== pageNumber - 1 ||
    page.entries.length !== descriptor.count ||
    page.entries.length > index.pageSize ||
    page.totalPages !== descriptors.length
  )
    throw new Error("CDN page identity differs");
  if (
    page.entries.some(
      (item) =>
        !safeCdnPath(item.path) ||
        !Number.isSafeInteger(item.size) ||
        item.size < 0 ||
        (item.sha256 !== null && !hex.test(item.sha256)),
    )
  )
    throw new Error("Invalid public asset");
  return { index, directory, page };
}
