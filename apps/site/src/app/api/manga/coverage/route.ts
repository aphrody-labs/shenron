// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/config";
import { CORS_MANGA } from "@/lib/manga-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_MANGA });
}

export async function GET() {
  try {
    const rows = await db.execute<{
      id: number; series: string; volume_number: number | null;
      chapters: number; listed_pages: number;
    }>(sql`
      SELECT v.id, v.series, v.volume_number,
             count(c.id)::int AS chapters,
             coalesce(sum(CASE WHEN jsonb_typeof(c.pages) = 'array'
               THEN jsonb_array_length(c.pages) ELSE 0 END), 0)::int AS listed_pages
      FROM bot.db_manga_volumes v
      LEFT JOIN bot.db_manga_chapters c ON c.volume_id = v.id AND c.visible IS NOT FALSE
      WHERE v.visible IS NOT FALSE
      GROUP BY v.id, v.series, v.volume_number
      ORDER BY v.series, v.volume_number, v.id
    `);
    const volumes = rows.map(row => ({
      id: Number(row.id), series: row.series === "DB_SOSH" ? "SOSH" : row.series,
      number: row.volume_number === null ? null : Number(row.volume_number),
      chapters: Number(row.chapters), listedPages: Number(row.listed_pages),
      hasListedPages: Number(row.listed_pages) > 0,
      url: `${SITE_URL}/api/manga/volume/${row.id}`,
    }));
    return NextResponse.json({
      observedAt: new Date().toISOString(),
      scope: "visible-catalogue-and-declared-page-references",
      assetAvailabilityVerified: false, fullEditionPaginationVerified: false,
      complete: false,
      totals: {
        volumes: volumes.length,
        volumesWithListedPages: volumes.filter(volume => volume.hasListedPages).length,
        listedPages: volumes.reduce((sum, volume) => sum + volume.listedPages, 0),
      },
      missingReaderVolumeIds: volumes.filter(volume => !volume.hasListedPages).map(volume => volume.id),
      volumes,
    }, { headers: { ...CORS_MANGA, "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch {
    return NextResponse.json({ error: "coverage_unavailable" }, {
      status: 503, headers: { ...CORS_MANGA, "Cache-Control": "no-store" },
    });
  }
}
