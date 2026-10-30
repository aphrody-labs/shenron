// SPDX-License-Identifier: Apache-2.0
/**
 * Verified Wikimedia portraits.
 *
 * Staff and voice-actor portraits point at Wikimedia files, some of which never existed
 * (measured 2026-10-30: dozens of `upload|thumb.wikimedia.org` URLs answering 404/400 on
 * /wiki/staff). Each file is checked once a day through the MediaWiki `imageinfo` API of
 * its project: an existing file resolves to its canonical thumbnail, a missing one to
 * `null` so the page renders its placeholder instead of a broken image. A network failure
 * keeps the original URL: nothing is dropped on an outage.
 */
import "server-only";

const THUMB_WIDTH = 330;
const BATCH = 50;
const REVALIDATE_SECONDS = 86_400;
const USER_AGENT = "DragonBallFR/1.0 (https://dragonballfr.com; contact@aphrody.com)";

export interface WikimediaFile {
  /** MediaWiki API origin of the file's project. */
  api: string;
  /** File title without the `File:` namespace, spaces as underscores. */
  title: string;
}

/** Parses an `upload.wikimedia.org` (or `thumb.wikimedia.org`) URL into its project file. */
export function parseWikimediaFile(raw: string): WikimediaFile | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "upload.wikimedia.org" && url.hostname !== "thumb.wikimedia.org")
    return null;
  const parts = url.pathname.split("/").filter(Boolean);
  // /<family>/<project>/[thumb/]<x>/<xy>/<File>[/<size>-<File>]
  if (parts.length < 5) return null;
  const [family, project] = parts;
  const rest = parts.slice(2);
  const offset = rest[0] === "thumb" ? 1 : 0;
  const file = rest[offset + 2];
  if (!family || !project || !file || !/^[0-9a-f]$/.test(rest[offset] ?? "")) return null;
  let title: string;
  try {
    title = decodeURIComponent(file);
  } catch {
    return null;
  }
  const api =
    project === "commons"
      ? "https://commons.wikimedia.org"
      : family === "wikipedia" && /^[a-z-]{2,12}$/.test(project)
        ? `https://${project}.wikipedia.org`
        : null;
  return api ? { api, title: title.replace(/ /g, "_") } : null;
}

interface ImageInfoResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    pages?: {
      title: string;
      missing?: boolean;
      imageinfo?: { thumburl?: string; url?: string }[];
    }[];
  };
}

async function lookup(api: string, titles: string[]): Promise<Map<string, string | null>> {
  const params = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(THUMB_WIDTH),
    format: "json",
    formatversion: "2",
    titles: titles.map((t) => `File:${t}`).join("|"),
  });
  const response = await fetch(`${api}/w/api.php?${params}`, {
    headers: { "user-agent": USER_AGENT },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`imageinfo ${response.status}`);
  const body = (await response.json()) as ImageInfoResponse;
  const toRequested = new Map<string, string>();
  for (const t of titles) toRequested.set(`File:${t.replace(/_/g, " ")}`, t);
  for (const n of body.query?.normalized ?? []) {
    const requested = n.from.replace(/^File:/, "");
    toRequested.set(n.to, requested);
  }
  const out = new Map<string, string | null>();
  for (const page of body.query?.pages ?? []) {
    const requested = toRequested.get(page.title);
    if (!requested) continue;
    const info = page.imageinfo?.[0];
    out.set(requested, page.missing || !info ? null : (info.thumburl ?? info.url ?? null));
  }
  return out;
}

/**
 * Resolves Wikimedia image URLs to verified thumbnails. Non-Wikimedia URLs map to themselves;
 * missing files map to `null`; lookup failures keep the original URL.
 */
export async function verifyWikimediaImages(
  urls: Iterable<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const byApi = new Map<string, Map<string, string[]>>();
  for (const url of urls) {
    if (!url || result.has(url)) continue;
    const file = parseWikimediaFile(url);
    result.set(url, url);
    if (!file) continue;
    const titles = byApi.get(file.api) ?? new Map<string, string[]>();
    titles.set(file.title, [...(titles.get(file.title) ?? []), url]);
    byApi.set(file.api, titles);
  }
  await Promise.all(
    [...byApi].flatMap(([api, titles]) => {
      const names = [...titles.keys()];
      const batches: string[][] = [];
      for (let i = 0; i < names.length; i += BATCH) batches.push(names.slice(i, i + BATCH));
      return batches.map(async (batch) => {
        try {
          const found = await lookup(api, batch);
          for (const name of batch) {
            if (!found.has(name)) continue;
            for (const url of titles.get(name) ?? []) result.set(url, found.get(name) ?? null);
          }
        } catch {
          // Outage: keep the original URLs.
        }
      });
    }),
  );
  return result;
}

/** Replaces each row's `image` with its verified Wikimedia thumbnail (or `null`). */
export async function withVerifiedImages<T extends { image?: string | null }>(
  rows: T[],
): Promise<T[]> {
  const verified = await verifyWikimediaImages(rows.map((r) => r.image));
  return rows.map((r) =>
    r.image && verified.has(r.image) ? ({ ...r, image: verified.get(r.image) ?? null } as T) : r,
  );
}
