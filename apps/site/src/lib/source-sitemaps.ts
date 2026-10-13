// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/config";
import { externalSourceHref } from "@/lib/external-source-catalog";

export const SOURCE_SITEMAP_SIZE = 20_000;
const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
type SourceRow = { url: string; fetchedAt: string | Date };
export function escapeSitemapXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!,
  );
}
export function sourceSitemapPages(total: number): number {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid public source count");
  const pages = Math.ceil(total / SOURCE_SITEMAP_SIZE);
  if (pages > 50_000) throw new Error("Source sitemap index requires further partitioning");
  return pages;
}
export function sourceSitemapPage(value: string): number | null {
  if (!/^[1-9]\d*\.xml$/.test(value)) return null;
  const page = Number(value.slice(0, -4));
  return Number.isSafeInteger(page) && page <= 50_000 ? page : null;
}
async function summary(): Promise<{ total: number; latest: Date | null }> {
  const rows = await db.execute(
    sql`SELECT count(*)::text AS total, max(fetched_at) AS latest FROM public.external_source_records WHERE http_status BETWEEN 200 AND 299`,
  );
  const row = (rows as unknown as { total: string; latest: string | Date | null }[])[0];
  if (!row) throw new Error("Public source count unavailable");
  const total = Number(row.total);
  sourceSitemapPages(total);
  const latest = row.latest ? new Date(row.latest) : null;
  if (latest && !Number.isFinite(latest.getTime()))
    throw new Error("Invalid source observation date");
  return { total, latest };
}
export function sourceSitemapIndexXml(total: number, latest: Date | null, base = SITE_URL): string {
  const entries = Array.from(
    { length: sourceSitemapPages(total) },
    (_, i) =>
      `<sitemap><loc>${escapeSitemapXml(`${base}/sources/sitemaps/${i + 1}.xml`)}</loc>${latest ? `<lastmod>${latest.toISOString()}</lastmod>` : ""}</sitemap>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="${namespace}">${entries}</sitemapindex>`;
}
export function sourceSitemapChunkXml(rows: SourceRow[], base = SITE_URL): string {
  if (rows.length > SOURCE_SITEMAP_SIZE) throw new Error("Source sitemap chunk exceeds its bound");
  const entries = rows
    .map((row) => {
      const modified = new Date(row.fetchedAt);
      if (!Number.isFinite(modified.getTime())) throw new Error("Invalid source observation date");
      const href = `${base}${externalSourceHref(row.url)}`;
      if (href.length >= 2048) throw new Error("Source sitemap location exceeds protocol limit");
      return `<url><loc>${escapeSitemapXml(href)}</loc><lastmod>${modified.toISOString()}</lastmod></url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="${namespace}">${entries}</urlset>`;
}
function xmlResponse(xml: string): Response {
  if (new TextEncoder().encode(xml).byteLength > 52_428_800)
    throw new Error("Source sitemap exceeds protocol size");
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function sourceSitemapIndexResponse(): Promise<Response> {
  const data = await summary();
  return xmlResponse(sourceSitemapIndexXml(data.total, data.latest));
}
export async function sourceSitemapChunkResponse(value: string): Promise<Response> {
  const page = sourceSitemapPage(value);
  if (page === null)
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const data = await summary();
  if (page > sourceSitemapPages(data.total))
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const offset = (page - 1) * SOURCE_SITEMAP_SIZE;
  const rows = await db.execute(
    sql`SELECT url, fetched_at AS "fetchedAt" FROM public.external_source_records WHERE http_status BETWEEN 200 AND 299 ORDER BY url ASC LIMIT ${SOURCE_SITEMAP_SIZE} OFFSET ${offset}`,
  );
  return xmlResponse(sourceSitemapChunkXml(rows as unknown as SourceRow[]));
}
