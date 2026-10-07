#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Index public Kanzenshuu WordPress media attachments whose parent is a known
 * editorial post/page (or which have no parent). Binary media is not downloaded.
 * Attachments with unrecognized parents are counted and excluded to avoid
 * ingesting user-uploaded material from non-editorial areas such as forums.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const API = "https://www.kanzenshuu.com/wp-json/wp/v2/media";
const SITE_INDEX = "data/catalogues/kanzenshuu-site-index.json";
const RAW_ROOT = "data/source-acquisition/kanzenshuu/site/media";
const OUT = "data/catalogues/kanzenshuu-site-media-index.json";

type MediaItem = {
  id: number;
  date: string;
  slug: string;
  link: string;
  source_url: string;
  title: { rendered: string };
  caption: { rendered: string };
  description: { rendered: string };
  alt_text: string;
  media_type: string;
  mime_type: string;
  post: number;
  media_details?: { width?: number; height?: number; filesize?: number };
};

function plain(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();
}

async function getPage(page: number) {
  const fields = "id,date,slug,link,source_url,title,caption,description,alt_text,media_type,mime_type,post,media_details";
  const url = `${API}?per_page=100&page=${page}&_fields=${fields}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Shenron editorial media index (dragonballfr.com)" } });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return {
        items: await response.json() as MediaItem[],
        total: Number(response.headers.get("x-wp-total")),
        pages: Number(response.headers.get("x-wp-totalpages")),
      };
    } catch (error) {
      lastError = error;
      await Bun.sleep(400 * (attempt + 1));
    }
  }
  throw lastError;
}

const site = JSON.parse(await Bun.file(SITE_INDEX).text()) as { records: { id: number; type: string; title: string; url: string }[] };
const editorialById = new Map(site.records.map((record) => [record.id, record]));
const first = await getPage(1);
const raw = [...first.items];
for (let page = 2; page <= first.pages; page++) {
  const result = await getPage(page);
  if (result.total !== first.total || result.pages !== first.pages) throw new Error(`Media API pagination changed at page ${page}`);
  raw.push(...result.items);
  if (page % 10 === 0 || page === first.pages) console.log(`media: fetched ${page}/${first.pages} (${raw.length}/${first.total})`);
  await Bun.sleep(100);
}
if (raw.length > first.total) throw new Error(`Media API returned ${raw.length}, more than its reported total ${first.total}`);
const uniqueRawIds = new Set(raw.map((item) => item.id));
if (uniqueRawIds.size !== raw.length) throw new Error(`Media API returned ${raw.length - uniqueRawIds.size} duplicate attachment rows`);

const records = [];
let excludedUnknownParents = 0;
for (const item of raw) {
  const linked = editorialById.get(item.post);
  if (item.post !== 0 && !linked) {
    excludedUnknownParents++;
    continue;
  }
  const url = new URL(item.source_url);
  if (url.hostname !== "www.kanzenshuu.com" || !url.pathname.startsWith("/wp-content/uploads/")) {
    throw new Error(`Rejected non-local media URL: ${item.source_url}`);
  }
  const year = item.date.slice(0, 4) || "undated";
  const record = {
    id: item.id,
    slug: item.slug,
    uploadedAt: item.date,
    mediaType: item.media_type,
    mimeType: item.mime_type,
    title: plain(item.title.rendered),
    caption: plain(item.caption.rendered),
    altText: item.alt_text,
    description: plain(item.description.rendered),
    sourceUrl: item.source_url,
    attachmentUrl: item.link,
    parentId: item.post || null,
    parentType: linked?.type ?? null,
    parentTitle: linked?.title ?? null,
    parentUrl: linked?.url ?? null,
    width: item.media_details?.width ?? null,
    height: item.media_details?.height ?? null,
    fileSizeBytes: item.media_details?.filesize ?? null,
    forumContent: false,
    binaryDownloaded: false,
    rawPath: `${RAW_ROOT}/${year}.json`,
  };
  records.push(record);
}

const ids = new Set(records.map((record) => record.id));
if (ids.size !== records.length) throw new Error("Duplicate media IDs");
const byYear = new Map<string, typeof records>();
for (const record of records) {
  const year = record.uploadedAt.slice(0, 4) || "undated";
  byYear.set(year, [...(byYear.get(year) ?? []), record]);
}
for (const [year, yearRecords] of byYear) {
  const rawRecords = raw.filter((item) => item.date.slice(0, 4) === year && (item.post === 0 || editorialById.has(item.post)));
  await mkdir(RAW_ROOT, { recursive: true });
  await Bun.write(join(RAW_ROOT, `${year}.json`), `${JSON.stringify({ type: "media", year, records: rawRecords }, null, 2)}\n`);
  const directory = "data/catalogues/kanzenshuu/site/media/years";
  await mkdir(directory, { recursive: true });
  await Bun.write(join(directory, `${year}.json`), `${JSON.stringify({ year, scope: "Public editorial Kanzenshuu media metadata; binaries remain at the source URLs and are not copied.", records: yearRecords }, null, 2)}\n`);
}

const result = {
  schemaVersion: 1,
  source: API,
  acquiredAt: new Date().toISOString(),
  scope: "Public attachment metadata whose parent is a catalogued Kanzenshuu editorial post/page or has no parent; unknown-parent attachments are excluded pending scope review. Forum uploads are not followed.",
  coverage: {
    mediaReportedByApi: first.total,
    rowsReturnedByPublicApi: raw.length,
    rowsNotReturnedByPublicApi: first.total - raw.length,
    metadataCatalogued: records.length,
    unknownParentsExcluded: excludedUnknownParents,
    binaryFilesDownloaded: 0,
  },
  records,
};
await Bun.write(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.coverage));
