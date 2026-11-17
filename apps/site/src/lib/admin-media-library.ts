// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { readCdnPage, safeCdnPath } from "./cdn-catalog";

export interface AdminMediaLibraryPage {
  directory: string;
  parent: string | null;
  revision: string;
  page: number;
  totalPages: number;
  totalFiles: number;
  folders: { path: string; name: string }[];
  files: {
    path: string;
    url: string;
    name: string;
    mime: string;
    bytes: number;
    sha256: string | null;
  }[];
}

export class AdminMediaQueryError extends Error {}

/** Browse the existing integrity-checked CDN projection, without copying its inventory. */
export async function readAdminMediaLibrary(
  params: URLSearchParams,
): Promise<AdminMediaLibraryPage> {
  const directory = params.get("path") ?? "/assets/wiki/";
  const page = Number(params.get("page") ?? 1);
  if (
    !safeCdnPath(directory) ||
    !directory.endsWith("/") ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100_000
  ) {
    throw new AdminMediaQueryError("Invalid media library query");
  }
  const data = await readCdnPage({ path: directory, page });
  const parent =
    directory === "/"
      ? null
      : directory.slice(0, -1).slice(0, directory.slice(0, -1).lastIndexOf("/") + 1);
  return {
    directory,
    parent,
    revision: data.index.revision,
    page: data.page.page + 1,
    totalPages: data.page.totalPages,
    totalFiles: data.directory?.fileCount ?? data.index.totalFiles,
    folders: data.page.entries
      .filter((entry) => entry.mime === "inode/directory")
      .map((entry) => ({
        path: entry.path,
        name: entry.path.slice(0, -1).split("/").at(-1) ?? entry.path,
      })),
    files: data.page.entries
      .filter((entry) => /^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/.test(entry.mime))
      .map((entry) => ({
        path: entry.path,
        url: new URL(
          entry.path.split("/").map(encodeURIComponent).join("/"),
          DEFAULT_PUBLIC_ORIGINS.cdn,
        ).href,
        name: entry.path.split("/").at(-1) ?? entry.path,
        mime: entry.mime,
        bytes: entry.size,
        sha256: entry.sha256,
      })),
  };
}
