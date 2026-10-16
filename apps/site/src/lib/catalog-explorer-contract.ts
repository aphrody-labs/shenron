// SPDX-License-Identifier: Apache-2.0
import type { ArchiveEntry } from "./archive-catalog";
export type CatalogCard = {
  category: string;
  id: string;
  title: string;
  description: string;
  image: string | null;
  href: string;
  originalHref: string | null;
  archive?: ArchiveEntry;
  source?: { host: string; kind: string };
};
export type CatalogLink = { category: string; id: string; title: string; href: string };
export type CatalogDetail = CatalogCard & {
  fields: { key: string; value: string }[];
  related: CatalogLink[];
  children: { category: string; href: string }[];
  assets: string[];
};
export type CatalogPage = {
  category: string;
  total: number;
  page: number;
  pageSize: number;
  items: CatalogCard[];
  observedAt: string;
};
export type CatalogSummary = {
  categories: { category: string; total: number; href: string }[];
  observedAt: string;
};

export const CATALOG_PAGE_SIZE = 48;
export function catalogPageNumber(value: unknown): number {
  const page = Number(value);
  return Number.isSafeInteger(page) &&
    page > 0 &&
    page <= Math.floor(Number.MAX_SAFE_INTEGER / CATALOG_PAGE_SIZE)
    ? page
    : 1;
}
export function catalogHref(category: string, id?: string): string {
  return `/catalog/${encodeURIComponent(category)}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
}
/** Only public HTTP links and origin-relative paths can become UI links. */
export function catalogPublicUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    [...value].some((char) => char.charCodeAt(0) <= 32)
  )
    return null;
  const normalized = value.startsWith("./assets/") ? value.slice(1) : value;
  let path = normalized.startsWith("/")
    ? normalized.split(/[?#]/)[0]!
    : (normalized.match(/^https?:\/\/[^/]+(\/[^?#]*)/i)?.[1] ?? "/");
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (
        path.includes("\\") ||
        [...path].some((char) => char.charCodeAt(0) < 32) ||
        path.split("/").some((part) => part === ".." || part === ".")
      )
        return null;
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      if (attempt === 7) return null;
      path = decoded;
    }
  } catch {
    return null;
  }
  if (
    normalized.startsWith("/") &&
    !normalized.startsWith("//") &&
    !normalized.split(/[/?#]/).some((part) => part === ".." || part === ".")
  )
    return normalized;
  try {
    const url = new URL(normalized);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
