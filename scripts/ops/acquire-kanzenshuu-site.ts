#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Private, forum-free inventory of Kanzenshuu WordPress posts and pages.
 * Full HTML bodies are retained only in ignored data/source-acquisition/;
 * the checked-in catalogue contains bibliographic metadata and short excerpts.
 *
 * Usage: bun scripts/ops/acquire-kanzenshuu-site.ts [--type posts|pages|all]
 */

import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const API = "https://www.kanzenshuu.com/wp-json/wp/v2";
const RAW_ROOT = "data/source-acquisition/kanzenshuu/site";
const OUT = "data/catalogues/kanzenshuu-site-index.json";
const typeIndex = process.argv.indexOf("--type");
const requestedType = typeIndex >= 0 ? (process.argv[typeIndex + 1] ?? "all") : "all";
const fromCache = process.argv.includes("--from-cache");
if (!["all", "posts", "pages"].includes(requestedType))
  throw new Error(`Unknown --type: ${requestedType}`);

type WpItem = {
  id: number;
  date: string;
  modified: string;
  slug: string;
  type: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string; protected: boolean };
  categories?: number[];
  tags?: number[];
  parent?: number;
};

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

async function getPage(
  type: "posts" | "pages",
  page: number,
): Promise<{ items: WpItem[]; total: number; pages: number }> {
  const fields = "id,date,modified,slug,type,link,title,excerpt,content,categories,tags,parent";
  const url = `${API}/${type}?per_page=100&page=${page}&_fields=${fields}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Shenron editorial research index (dragonballfr.com)" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} at ${url}`);
      return {
        items: (await response.json()) as WpItem[],
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

async function getTerms(
  type: "categories" | "tags",
): Promise<{ id: number; name: string; slug: string; count: number; link: string }[]> {
  const url = `${API}/${type}?per_page=100&page=1&_fields=id,name,slug,count,link`;
  const response = await fetch(url, {
    headers: { "user-agent": "Shenron editorial research index (dragonballfr.com)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${url}`);
  const terms = (await response.json()) as {
    id: number;
    name: string;
    slug: string;
    count: number;
    link: string;
  }[];
  const expected = Number(response.headers.get("x-wp-total"));
  if (terms.length !== expected)
    throw new Error(`${type}: received ${terms.length}; expected ${expected}`);
  if (terms.some((term) => /^(?:forum|forums)$/i.test(term.slug)))
    throw new Error(`${type}: forum taxonomy is out of scope`);
  return terms;
}

const itemTypes: readonly ("posts" | "pages")[] =
  requestedType === "all" ? ["posts", "pages"] : [requestedType as "posts" | "pages"];
const catalogueRecords: Record<string, unknown>[] = [];
let totalExpected = 0;
for (const type of itemTypes) {
  let all: WpItem[];
  if (fromCache) {
    const directory = join(RAW_ROOT, type);
    const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
    all = [];
    for (const file of files) {
      const cached = JSON.parse(await readFile(join(directory, file), "utf8")) as {
        records: WpItem[];
      };
      all.push(...cached.records);
    }
    all.sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id);
  } else {
    const first = await getPage(type, 1);
    totalExpected += first.total;
    all = [...first.items];
    for (let page = 2; page <= first.pages; page++) {
      const result = await getPage(type, page);
      all.push(...result.items);
      if (page % 10 === 0 || page === first.pages)
        console.log(`${type}: fetched page ${page}/${first.pages} (${all.length}/${first.total})`);
      await Bun.sleep(100);
    }
    if (all.length !== first.total)
      throw new Error(`${type}: received ${all.length}; expected ${first.total}`);
  }
  if (fromCache) totalExpected += all.length;

  const rawByYear = new Map<string, WpItem[]>();
  for (const item of all) {
    const url = new URL(item.link);
    if (url.hostname !== "www.kanzenshuu.com" || /\/(?:forum|forums)(?:\/|$)/i.test(url.pathname)) {
      throw new Error(`Rejected out-of-scope/forum content URL: ${item.link}`);
    }
    const year = item.date.slice(0, 4) || "undated";
    const section =
      type === "pages" ? (url.pathname.split("/").filter(Boolean)[0] ?? "root") : null;
    rawByYear.set(year, [...(rawByYear.get(year) ?? []), item]);
    catalogueRecords.push({
      id: item.id,
      type,
      slug: item.slug,
      title: stripHtml(item.title.rendered),
      date: item.date,
      modified: item.modified,
      url: item.link,
      excerpt: stripHtml(item.excerpt.rendered),
      categories: item.categories ?? [],
      tags: item.tags ?? [],
      parent: item.parent ?? null,
      section,
      contentProtected: item.content.protected,
      bodyAvailable: Boolean(item.content.rendered),
      forumContent: false,
      rawPath: `${RAW_ROOT}/${type}/${year}.json`,
    });
  }

  for (const [year, records] of rawByYear) {
    const directory = join(RAW_ROOT, type);
    await mkdir(directory, { recursive: true });
    await Bun.write(
      join(directory, `${year}.json`),
      `${JSON.stringify({ fetchedAt: new Date().toISOString(), type, year, records }, null, 2)}\n`,
    );
  }
}

const [categories, tags] = await Promise.all([getTerms("categories"), getTerms("tags")]);
const categoryById = new Map(categories.map((term) => [term.id, term]));
const tagById = new Map(tags.map((term) => [term.id, term]));
for (const record of catalogueRecords) {
  record.categoryTerms = (record.categories as number[])
    .map((id) => categoryById.get(id))
    .filter(Boolean);
  record.tagTerms = (record.tags as number[]).map((id) => tagById.get(id)).filter(Boolean);
}
const unique = new Set(catalogueRecords.map((record) => `${record.type}:${record.id}`));
if (unique.size !== catalogueRecords.length)
  throw new Error("Duplicate WordPress record IDs in inventory");
await mkdir("data/catalogues", { recursive: true });
const result = {
  schemaVersion: 1,
  source: `${API}/posts and ${API}/pages`,
  acquiredAt: new Date().toISOString(),
  scope:
    "Public Kanzenshuu WordPress posts and pages; external forum content excluded. Full HTML is stored privately under ignored data/source-acquisition/.",
  totals: {
    fetched: catalogueRecords.length,
    posts: catalogueRecords.filter((record) => record.type === "posts").length,
    pages: catalogueRecords.filter((record) => record.type === "pages").length,
    expected: totalExpected,
  },
  taxonomies: { categories, tags },
  records: catalogueRecords,
};
await Bun.write(OUT, `${JSON.stringify(result, null, 2)}\n`);
const postsByYear = new Map<string, Record<string, unknown>[]>();
const pagesBySection = new Map<string, Record<string, unknown>[]>();
for (const record of catalogueRecords) {
  if (record.type === "posts") {
    const year = String(record.date).slice(0, 4) || "undated";
    postsByYear.set(year, [...(postsByYear.get(year) ?? []), record]);
  } else {
    const section = String(record.section ?? "root");
    pagesBySection.set(section, [...(pagesBySection.get(section) ?? []), record]);
  }
}
for (const [year, records] of postsByYear) {
  const directory = "data/catalogues/kanzenshuu/site/posts/years";
  await mkdir(directory, { recursive: true });
  await Bun.write(
    join(directory, `${year}.json`),
    `${JSON.stringify({ year, scope: "Public Kanzenshuu WordPress posts published in this year; metadata only, private source bodies referenced by rawPath.", records }, null, 2)}\n`,
  );
}
for (const [section, records] of pagesBySection) {
  const directory = "data/catalogues/kanzenshuu/site/pages/sections";
  await mkdir(directory, { recursive: true });
  await Bun.write(
    join(directory, `${section}.json`),
    `${JSON.stringify({ section, scope: "Public Kanzenshuu WordPress pages in this route section; metadata only, private source bodies referenced by rawPath.", records }, null, 2)}\n`,
  );
}
console.log(JSON.stringify(result.totals));
