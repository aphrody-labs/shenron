#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Acquires Kanzenshuu's editorial interview archive for private research and
 * writes a structured metadata index. The crawl is restricted to /translations/;
 * forum URLs are never followed. Source HTML stays under ignored
 * data/source-acquisition/ and must not be published.
 *
 * Usage: bun scripts/ops/acquire-kanzenshuu-interviews.ts [--limit N]
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ARCHIVE = "https://www.kanzenshuu.com/translations/";
const RAW_DIR = "data/source-acquisition/kanzenshuu/interviews";
const OUT = "data/catalogues/kanzenshuu-interviews.json";
const ALTERNATE_SOURCES: Record<string, string> = {
  "the-case-of-being-reincarnated-as-yamcha-buzzfeed-japan-interview":
    "https://www.buzzfeed.com/jp/tsunehikonishimaki/reincarnation-yamcha",
};
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const fromCache = process.argv.includes("--from-cache");

function decode(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;|&lsquo;/g, "’")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function field(html: string, cls: string): string | null {
  const match = html.match(
    new RegExp(
      `<([a-z0-9]+)[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    ),
  );
  return match ? decode(match[2]) : null;
}

async function get(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Shenron research index (contact: dragonballfr.com)" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await Bun.sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

const archiveHtml = await get(ARCHIVE);
const candidates = [...archiveHtml.matchAll(/<li class=["']item["']>([\s\S]*?)<\/li>/gi)].flatMap(
  (match) => {
    const block = match[1];
    const href = block.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1];
    const format = field(block, "format");
    if (!href || !format || !/interview/i.test(format)) return [];
    const url = new URL(href, ARCHIVE);
    if (url.origin !== new URL(ARCHIVE).origin || !url.pathname.startsWith("/translations/"))
      return [];
    return [
      {
        id: url.pathname.split("/").filter(Boolean).at(-1)!,
        url: url.href,
        title: field(block, "title") ?? "Untitled interview",
        publication: field(block, "source"),
        publicationType: field(block, "type"),
        format,
        publicationDate: field(block, "date"),
        participants: field(block, "people")?.split(/,\s*/) ?? [],
        topics: field(block, "topic")?.split(/,\s*/) ?? [],
      },
    ];
  },
);

const unique = [...new Map(candidates.map((item) => [item.url, item])).values()].slice(0, limit);
await mkdir(RAW_DIR, { recursive: true });
const records = [];
for (const [index, item] of unique.entries()) {
  const rawPath = `${RAW_DIR}/${item.id}.html`;
  const rawFilePath = join(RAW_DIR, `${item.id}.html`);
  let acquired = false;
  let pageTitle: string | null = null;
  let sourceDescription: string | null = null;
  let questionCount = 0;
  let sectionHeadings: string[] = [];
  try {
    const html = fromCache ? await Bun.file(rawFilePath).text() : await get(item.url);
    if (!fromCache) await Bun.write(rawFilePath, html);
    acquired = true;
    pageTitle = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null;
    sourceDescription =
      decode(
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1] ??
          "",
      ) || null;
    questionCount = [...html.matchAll(/class=["']question["']/gi)].length;
    sectionHeadings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
      .map((heading) => decode(heading[1]))
      .filter(Boolean)
      .slice(-12);
  } catch (error) {
    console.error(`Failed ${item.url}: ${String(error)}`);
  }
  records.push({
    ...item,
    rawPath,
    acquired,
    forumContent: false,
    alternatePrimarySource: ALTERNATE_SOURCES[item.id] ?? null,
    pageTitle,
    sourceDescription,
    questionCount,
    sectionHeadings,
    editorialSummary: null,
    reviewStatus: acquired
      ? "source-acquired-summary-pending"
      : ALTERNATE_SOURCES[item.id]
        ? "kanzenshuu-source-unavailable-alternate-primary-source-found"
        : "source-unavailable",
  });
  if ((index + 1) % 10 === 0) console.log(`Fetched ${index + 1}/${unique.length}`);
  if (!fromCache) await Bun.sleep(150);
}

const result = {
  schemaVersion: 1,
  sourceArchive: ARCHIVE,
  acquiredAt: new Date().toISOString(),
  scope: "Editorial translation archive entries labeled Interview; forum pages excluded.",
  records,
  coverage: {
    archiveInterviewEntries: candidates.length,
    attempted: unique.length,
    acquired: records.filter((record) => record.acquired).length,
    alternatePrimarySources: records.filter((record) => record.alternatePrimarySource).length,
    failed: records.filter((record) => !record.acquired).map((record) => record.url),
  },
};
await Bun.write(OUT, `${JSON.stringify(result, null, 2)}\n`);
const years = new Map<string, typeof records>();
for (const record of records) {
  const year = Number(record.publicationDate?.match(/\b\d{4}\b/)?.[0]);
  const decade = Number.isFinite(year) && year > 0 ? `${Math.floor(year / 10) * 10}s` : "undated";
  years.set(decade, [...(years.get(decade) ?? []), record]);
}
const shardDir = "data/catalogues/kanzenshuu/interviews";
await mkdir(shardDir, { recursive: true });
for (const [decade, shard] of years) {
  await Bun.write(
    join(shardDir, `${decade}.json`),
    `${JSON.stringify({ decade, records: shard }, null, 2)}\n`,
  );
}
console.log(JSON.stringify(result.coverage, null, 2));
