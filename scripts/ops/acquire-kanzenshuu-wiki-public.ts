#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Acquire only the public preview pages explicitly listed on Kanzenshuu's
 * MediaWiki Main Page. Do not enumerate or request the wiki's restricted pages,
 * namespaces, talk pages, or the separate forum.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const API = "https://www.kanzenshuu.com/mediawiki/api.php";
const RAW_DIR = "data/source-acquisition/kanzenshuu/wiki-public";
const OUT = "data/catalogues/kanzenshuu-wiki-public.json";
const PUBLIC_PREVIEW_PAGES = [
  "Main Page",
  "Yamoshi",
  "Amond",
  "Hoi-Poi Capsule",
  "Age 757",
  '"Xeno" (Suffix)',
  "Kintoki: Toki of the Golden-Eyed Tribe",
  "Sachie-chan GOOD!!",
  "Saikyō Jump",
  "List of Super Dragon Ball Heroes Episodes",
  "Yūya Mori catalogue",
  "Super Dragon Ball Heroes Cast",
  "Super Dragon Ball Heroes Staff",
  "Super Dragon Ball Heroes Music",
  "Season",
] as const;

type ApiPage = {
  pageid: number;
  ns: number;
  title: string;
  lastrevid?: number;
  revisions?: { revid: number; timestamp: string; slots?: { main?: { content?: string } } }[];
};

const params = new URLSearchParams({
  action: "query",
  prop: "revisions|categories",
  rvprop: "content|timestamp",
  rvslots: "main",
  clshow: "!hidden",
  cllimit: "max",
  titles: PUBLIC_PREVIEW_PAGES.join("|"),
  format: "json",
  formatversion: "2",
});
const url = `${API}?${params}`;
const response = await fetch(url, { headers: { "user-agent": "Shenron public-page research index (dragonballfr.com)" } });
if (!response.ok) throw new Error(`HTTP ${response.status} for public MediaWiki preview pages`);
const payload = await response.json() as { query: { pages: (ApiPage & { categories?: { title: string }[] })[] } };
const pages = payload.query.pages;
if (pages.length !== PUBLIC_PREVIEW_PAGES.length) throw new Error(`Received ${pages.length} public pages; expected ${PUBLIC_PREVIEW_PAGES.length}`);
const records = [];
await mkdir(RAW_DIR, { recursive: true });
for (const page of pages) {
  if (page.ns !== 0) throw new Error(`Refusing non-article namespace ${page.ns}: ${page.title}`);
  const revision = page.revisions?.[0];
  const wikitext = revision?.slots?.main?.content;
  if (!revision || typeof wikitext !== "string") throw new Error(`Public page body unavailable: ${page.title}`);
  const id = page.title.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const rawPath = `${RAW_DIR}/${id}.json`;
  await Bun.write(join(RAW_DIR, `${id}.json`), `${JSON.stringify({ pageId: page.pageid, title: page.title, revisionId: revision.revid, revisedAt: revision.timestamp, wikitext }, null, 2)}\n`);
  records.push({
    id,
    pageId: page.pageid,
    title: page.title,
    url: `https://www.kanzenshuu.com/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    revisionId: revision.revid,
    revisedAt: revision.timestamp,
    categories: page.categories?.map((category) => category.title) ?? [],
    rawPath,
    bodyCaptured: true,
    publicPreviewListed: true,
    forumContent: false,
    editorialSummary: null,
    reviewStatus: "public-preview-source-acquired-summary-pending",
  });
}
const result = {
  schemaVersion: 1,
  source: "https://www.kanzenshuu.com/wiki/Main_Page",
  api: API,
  acquiredAt: new Date().toISOString(),
  scope: "Main Page and the 14 article pages explicitly listed there as Public Preview Pages. Restricted articles, talk namespaces and the separate forum are not requested.",
  expectedPublicPages: PUBLIC_PREVIEW_PAGES.length,
  records,
};
await mkdir("data/catalogues", { recursive: true });
await Bun.write(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ expected: PUBLIC_PREVIEW_PAGES.length, acquired: records.length, pagesWithoutSource: records.filter((record) => !record.bodyCaptured).length }));
