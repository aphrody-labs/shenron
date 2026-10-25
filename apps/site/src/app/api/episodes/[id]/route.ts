import { readPlaybackCapabilities } from "@/lib/playback-capabilities";
import { NextResponse } from "next/server";
import { dbUniverse } from "@/lib/db-universe";
import { episodeApiSummary } from "@/lib/episode-api";
import { idDeFiche } from "../../../wiki/_id-fiche";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numero = idDeFiche(id);
    if (numero === null) {
      return NextResponse.json(
        { error: "Identifiant d'épisode invalide" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const ep = await dbUniverse.episode(numero);
    if (!ep) {
      return NextResponse.json(
        { error: "Épisode introuvable" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const [nav, saga] = await Promise.all([
      dbUniverse
        .episodeNav(ep.series, ep.number_in_series)
        .catch(() => ({ prev: null, next: null })),
      dbUniverse.episodeSaga(ep.series, ep.number_in_series).catch(() => null),
    ]);

    const previous = nav?.prev ?? null;
    const next = nav?.next ?? null;
    return NextResponse.json(
      {
        ...episodeApiSummary(ep, await readPlaybackCapabilities()),
        synopsisFr: ep.synopsis,
        arcId: ep.arc_id,
        saga: saga ? { id: saga.id, name: saga.name, slug: saga.slug } : null,
        framesCount: ep.frames?.length ?? 0,
        navigation: {
          prev: previous
            ? {
                id: previous.id,
                numberInSeries: previous.number_in_series,
                title: previous.title,
                url: `/wiki/episodes/${previous.id}`,
              }
            : null,
          next: next
            ? {
                id: next.id,
                numberInSeries: next.number_in_series,
                title: next.title,
                url: `/wiki/episodes/${next.id}`,
              }
            : null,
        },
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, s-maxage=30",
        },
      },
    );
  } catch (error) {
    console.error("Episode detail API request failed", error);
    return NextResponse.json(
      { error: "episode_fetch_failed" },
      { status: 500, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
    );
  }
}
