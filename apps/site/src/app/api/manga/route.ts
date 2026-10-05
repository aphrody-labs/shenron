/**
 * GET /api/manga — la porte d'entrée du manga pour un agent ou un `curl`.
 *
 * Elle répond ce que le catalogue contient (tomes, chapitres, planches,
 * transcriptions) ET comment aller plus loin : chaque ressource est annoncée
 * avec son URL exacte, pas décrite en prose. C'est ce qui permet à un client qui
 * ne connaît rien du site de descendre jusqu'à une planche en trois appels.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/config";
import { CORS_MANGA } from "@/lib/manga-cors";

export const runtime = "nodejs";
export const revalidate = 3600;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_MANGA });
}

export async function GET() {
  let series: Array<{
    series: string;
    volumes: number;
    chapters: number;
    pages: number;
    /** @deprecated Ancien nom de `volumes`. */
    tomes: number;
    /** @deprecated Ancien nom de `chapters`. */
    chapitres: number;
    /** @deprecated Ancien nom de `pages`. */
    planches: number;
  }> = [];
  let catalog: Array<{
    id: number;
    series: string;
    number: number | null;
    title: string | null;
    titleJa: string | null;
    publishedAt: number | null;
    isbn: string | null;
    cover: string | null;
    url: string;
    readableHere: boolean;
    /** @deprecated Ancien nom de `number`. */
    numero: number | null;
    /** @deprecated Ancien nom de `title`. */
    titre: string | null;
    /** @deprecated Ancien nom de `titleJa`. */
    titreJa: string | null;
    /** @deprecated Ancien nom de `publishedAt`. */
    datePublication: number | null;
    /** @deprecated Ancien nom de `cover`. */
    couverture: string | null;
    /** @deprecated Ancien nom de `readableHere`. */
    lectureDisponibleIci: boolean;
  }> = [];
  let transcribed = 0;
  try {
    const rows = await db.execute<{
      series: string;
      chapitres: number;
      planches: number;
    }>(sql`
			SELECT series,
			       count(*)::int AS chapitres,
			       coalesce(sum(CASE WHEN jsonb_typeof(pages) = 'array'
			                         THEN jsonb_array_length(pages) ELSE 0 END), 0)::int AS planches
			FROM bot.db_manga_chapters
			WHERE visible IS NOT false
			GROUP BY series ORDER BY series
		`);
    const tomes = await db.execute<{ series: string; tomes: number }>(sql`
			SELECT series, count(*)::int AS tomes FROM bot.db_manga_volumes
			WHERE visible IS NOT false GROUP BY series
		`);
    const parSerie = new Map(tomes.map((t) => [t.series, Number(t.tomes)]));
    series = rows.map((r) => {
      const volumes = parSerie.get(r.series) ?? 0;
      const chapters = Number(r.chapitres);
      const pages = Number(r.planches);
      return {
        series: r.series,
        volumes,
        chapters,
        pages,
        tomes: volumes,
        chapitres: chapters,
        planches: pages,
      };
    });
    const catalogueRows = await db.execute<{
      id: number;
      series: string;
      volume_number: number | null;
      title: string | null;
      title_ja: string | null;
      published_at: number | null;
      isbn: string | null;
      cover: string | null;
      readable_here: boolean;
    }>(sql`
			SELECT
				v.id, v.series, v.volume_number, v.title, v.title_ja,
				v.published_at, v.isbn, v.cover,
				EXISTS (
					SELECT 1
					FROM bot.db_manga_chapters c
					WHERE c.volume_id = v.id
						AND c.visible IS NOT FALSE
						AND jsonb_typeof(c.pages) = 'array'
						AND jsonb_array_length(c.pages) > 0
				) AS readable_here
			FROM bot.db_manga_volumes v
			WHERE v.visible IS NOT FALSE
			ORDER BY v.series, v.volume_number NULLS LAST, v.id
		`);
    catalog = catalogueRows.map((volume) => {
      const number = volume.volume_number == null ? null : Number(volume.volume_number);
      const publishedAt = volume.published_at == null ? null : Number(volume.published_at);
      const readableHere = Boolean(volume.readable_here);
      return {
        id: Number(volume.id),
        series: volume.series,
        number,
        title: volume.title,
        titleJa: volume.title_ja,
        publishedAt,
        isbn: volume.isbn,
        cover: volume.cover,
        url: `${SITE_URL}/api/manga/volume/${volume.id}`,
        readableHere,
        numero: number,
        titre: volume.title,
        titreJa: volume.title_ja,
        datePublication: publishedAt,
        couverture: volume.cover,
        lectureDisponibleIci: readableHere,
      };
    });
    const ocr = await db.execute<{ n: number }>(sql`
			SELECT count(*)::int AS n FROM bot.db_manga_pages
			WHERE nullif(btrim(text), '') IS NOT NULL
		`);
    transcribed = Number(ocr[0]?.n ?? 0);
  } catch (e) {
    console.error("[api/manga] index indisponible:", e);
  }

  const name = "Manga Dragon Ball — API de lecture";
  const description =
    "Tomes, chapitres et planches du manga. Chaque planche est une ressource : " +
    "son image, sa transcription, et l'URL de la page de lecture correspondante.";
  const license =
    "Catalogue, couvertures et ressources de lecture. Les droits et les statuts de publication restent attachés à chaque source.";
  const routes = {
    volume: `${SITE_URL}/api/manga/volume/{id}`,
    chapter: `${SITE_URL}/api/manga/chapter/{id}`,
    page: `${SITE_URL}/api/manga/chapter/{id}/pages/{n}`,
    pageImage: `${SITE_URL}/api/manga/chapter/{id}/pages/{n}?format=image`,
    pageText: `${SITE_URL}/api/manga/chapter/{id}/pages/{n}?format=text`,
    search: `${SITE_URL}/api/manga/search?q={text}`,
    timeline: `${SITE_URL}/api/timeline`,
    readableVolumes: `${SITE_URL}/wiki/manga`,
  };
  const examples = [
    `curl ${SITE_URL}/api/manga/search?q=kamehameha`,
    `curl ${SITE_URL}/api/manga/chapter/1421`,
    `curl ${SITE_URL}/api/manga/chapter/1421/pages/12`,
    `curl -L -o page.webp "${SITE_URL}/api/manga/chapter/1421/pages/12?format=image"`,
  ];

  return NextResponse.json(
    {
      name,
      description,
      license,
      series,
      catalog,
      transcribedPages: transcribed,
      routes: {
        ...routes,
        // Anciens noms, gardés en doublon déprécié le temps d'une version.
        tome: routes.volume,
        chapitre: routes.chapter,
        planche: routes.page,
        plancheImage: routes.pageImage,
        plancheTexte: routes.pageText,
        recherche: `${SITE_URL}/api/manga/search?q={texte}`,
        chronologie: routes.timeline,
        tomesLisibles: routes.readableVolumes,
      },
      examples,
      /** @deprecated Anciens noms des champs ci-dessus. */
      nom: name,
      licence: license,
      catalogue: catalog,
      planchesTranscrites: transcribed,
      exemples: examples,
      // Pas de champ `mcp` : `mcp.dragonballfr.com` a été retiré le 2026-09-25
      // (shenron-mcp fusionné dans les outils `aphrody-mcp` dragonball.*, qui ne
      // sont pas exposés en HTTP public — cf. yolo
      // config/host/nginx/routes.json et config/service-catalog.json). Republier
      // cette URL la ferait 404 pour quiconque l'appelle depuis cette réponse.
    },
    { headers: { ...CORS_MANGA, "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
