/**
 * scene-search — recherche d'une phrase dans le titre et le synopsis des épisodes (Postgres).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assetUrl } from "@/lib/assets";
import { sansAccents } from "@/lib/pg-unaccent";
import { extraitAutour, normaliser, scorer } from "@/lib/manga-search-rules";

/* ───────────── Recherche inverse : du texte vers les scènes ───────────── */

export type SceneTrouvee = {
  id: number;
  series: string;
  numberInSeries: number | null;
  title: string | null;
  image: string | null;
  extrait: string;
  score: number;
  href: string;
};

/**
 * Une phrase → les épisodes où la scène se
 * trouve.
 *
 * Tant que l'index local frame par frame est vide, aucune frame ne porte de
 * légende : on cherche donc dans ce qui décrit réellement une scène — le titre
 * et le synopsis de l'épisode — avec le même algorithme de rappel que les
 * planches (trigrammes sans accents) et le même classement. Le jour où les
 * frames seront légendées, c'est ici qu'elles viendront s'ajouter.
 */
export async function chercherScenes(q: string, limit = 8): Promise<SceneTrouvee[]> {
  const terme = q.trim().slice(0, 120);
  if (terme.length < 2) return [];
  const norm = normaliser(terme);
  const max = Math.min(Math.max(limit, 1), 30);

  const corpusNorm = await sansAccents(sql`concat_ws(' ', title, synopsis_fr, synopsis)`);

  const rows = await db.execute<{
    id: number;
    series: string;
    number_in_series: number | null;
    title: string | null;
    image: string | null;
    corpus: string;
    sim: number;
  }>(sql`
		SELECT id, series, number_in_series, title, image,
			concat_ws(' — ', title, synopsis_fr, synopsis) AS corpus,
			word_similarity(${norm}, ${corpusNorm})::float8 AS sim
		FROM bot.db_episodes
		WHERE visible IS NOT FALSE
			AND (
				${corpusNorm} LIKE ${"%" + norm + "%"}
				OR word_similarity(${norm}, ${corpusNorm}) >= 0.5
			)
		ORDER BY sim DESC
		LIMIT ${max * 4}
	`);

  return rows
    .map((r) => ({ r, d: scorer(r.corpus, terme, Number(r.sim) || 0) }))
    .filter((x) => x.d.score > 0)
    .toSorted((a, b) => b.d.score - a.d.score || Number(a.r.id) - Number(b.r.id))
    .slice(0, max)
    .map(({ r, d }) => ({
      id: Number(r.id),
      series: r.series,
      numberInSeries: r.number_in_series,
      title: r.title,
      image: r.image ? assetUrl(r.image) : null,
      extrait: extraitAutour(r.corpus, terme, 180),
      score: d.score,
      href: `/wiki/episodes/${r.id}`,
    }));
}
