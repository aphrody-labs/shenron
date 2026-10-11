import { NextResponse } from "next/server";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl, hlsMasterUrl } from "@/lib/assets";
import { idDeFiche } from "../../../wiki/_id-fiche";

export const runtime = "nodejs";
export const revalidate = 3600;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SERIES_LABELS: Record<string, string> = {
  DB: "Dragon Ball",
  DBZ: "Dragon Ball Z",
  DBZ_KAI: "Dragon Ball Z Kai",
  DBZ_KAI_FINAL: "Dragon Ball Z Kai – Final Chapters",
  DBGT: "Dragon Ball GT",
  DBS: "Dragon Ball Super",
  DB_DAIMA: "Dragon Ball Daima",
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
    const players = Array.isArray(ep.players) ? ep.players : [];
    const hasVf = players.some((p) => p.lang === "vf");
    const hasVostfr = players.some((p) => p.lang === "vostfr");
    const hasVost = players.some((p) => p.lang === "vost");

    return NextResponse.json(
      {
        id: ep.id,
        series: ep.series,
        seriesLabel: SERIES_LABELS[ep.series] ?? ep.series,
        numberInSeries: ep.number_in_series,
        title: ep.title,
        titleJa: ep.title_ja,
        airDate: ep.air_date,
        image: ep.image,
        imageUrl: ep.image ? assetUrl(ep.image) : null,
        synopsis: ep.synopsis,
        synopsisFr: ep.synopsis,
        arcId: ep.arc_id,
        saga: saga ? { id: saga.id, name: saga.name, slug: saga.slug } : null,
        hasVf,
        hasVostfr,
        hasVost,
        playerCount: players.length,
        players: players.map((p) => ({
          name: p.name,
          provider: p.provider,
          lang: p.lang,
          embedUrl: p.embedUrl,
        })),
        hlsMasterUrl: ep.stream_url ? hlsMasterUrl(ep.id) : null,
        subtitles: ep.subtitles ?? [],
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
        url: `/wiki/episodes/${ep.id}`,
        downloadUrl: `/api/episodes/${ep.id}/download`,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Erreur serveur lors de la récupération de l'épisode",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
