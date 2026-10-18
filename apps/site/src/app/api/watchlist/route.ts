// SPDX-License-Identifier: Apache-2.0
import { NextResponse, type NextRequest } from "next/server";
import { CRUNCHYROLL_SERIES_BY_SHENRON } from "@aphrody/shenron-media/crunchyroll-mapping";

export const runtime = "nodejs";

const WATCHLIST_STORAGE: Array<{
  id: string;
  seriesId: string;
  seriesTitle: string;
  episodeNumber?: number;
  episodeTitle?: string;
  thumbnailUrl?: string;
  watchUrl: string;
  durationMinutes?: number;
  progressPercent?: number;
  availableLangs: Array<"vf" | "vostfr" | "vost">;
  provider: "crunchyroll" | "shenron";
}> = [
  {
    id: "GE00389313JAJP",
    seriesId: CRUNCHYROLL_SERIES_BY_SHENRON.DBS_BEERUS,
    seriesTitle: "Dragon Ball Super: Beerus",
    episodeNumber: 1,
    episodeTitle: "Le dieu de la Destruction",
    thumbnailUrl: "/banners/dbs-beerus-2026.jpg",
    watchUrl: "/wiki/episodes/875",
    durationMinutes: 24,
    progressPercent: 35,
    availableLangs: ["vostfr"],
    provider: "crunchyroll",
  },
  {
    id: "GE00389314JAJP",
    seriesId: CRUNCHYROLL_SERIES_BY_SHENRON.DBS_BEERUS,
    seriesTitle: "Dragon Ball Super: Beerus",
    episodeNumber: 2,
    episodeTitle: "Le dieu de la Destruction se rend sur la planète de Kaïo",
    thumbnailUrl: "/banners/dbs-beerus-2026.jpg",
    watchUrl: "/wiki/episodes/876",
    durationMinutes: 24,
    progressPercent: 0,
    availableLangs: ["vostfr"],
    provider: "crunchyroll",
  },
];

export async function GET() {
  return NextResponse.json(
    {
      total: WATCHLIST_STORAGE.length,
      items: WATCHLIST_STORAGE,
    },
    {
      headers: {
        "Cache-Control": "private, no-cache",
        "Content-Type": "application/json",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || !body.seriesTitle || !body.watchUrl) {
      return NextResponse.json({ error: "seriesTitle and watchUrl are required" }, { status: 400 });
    }
    const newEntry = {
      id: body.id || `custom-${Date.now()}`,
      seriesId: body.seriesId || "CUSTOM",
      seriesTitle: String(body.seriesTitle),
      episodeNumber: body.episodeNumber ? Number(body.episodeNumber) : undefined,
      episodeTitle: body.episodeTitle ? String(body.episodeTitle) : undefined,
      thumbnailUrl: body.thumbnailUrl ? String(body.thumbnailUrl) : undefined,
      watchUrl: String(body.watchUrl),
      durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : undefined,
      progressPercent: body.progressPercent ? Number(body.progressPercent) : 0,
      availableLangs: body.availableLangs || ["vostfr"],
      provider: body.provider || "crunchyroll",
    };
    WATCHLIST_STORAGE.push(newEntry);
    return NextResponse.json({ success: true, item: newEntry }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
