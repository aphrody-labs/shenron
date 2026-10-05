import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { listDatabooks } from "@/lib/databooks";
import { indexDatabook } from "@/lib/databooks-redis";

/** How trustworthy the stored OCR of a work is, from its share of defective pages. */
type SourceQuality = "sound" | "average" | "to-retranscribe";

/** The French spelling of each quality, served in the deprecated `qualiteSource`. */
const LEGACY_QUALITY: Record<SourceQuality, "saine" | "moyenne" | "a-retranscrire"> = {
  sound: "saine",
  average: "moyenne",
  "to-retranscribe": "a-retranscrire",
};

/**
 * Translation queue status of one work. The French fields at the bottom are the
 * former names, served as deprecated duplicates until 1.4.0.
 */
interface CampaignWorkStatus {
  id: number;
  title: string;
  category: string | null;
  totalPages: number;
  transcribed: number;
  translated: number;
  faulty: number;
  remainingToTranslate: number;
  /** Japanese characters still to translate. */
  remainingJaChars: number;
  sourceQuality: SourceQuality;
  /** @deprecated Former name of `title`. */
  titre: string;
  /** @deprecated Former name of `totalPages`. */
  totalPlanches: number;
  /** @deprecated Former name of `transcribed`. */
  transcrites: number;
  /** @deprecated Former name of `translated`. */
  traduites: number;
  /** @deprecated Former name of `faulty`. */
  fautives: number;
  /** @deprecated Former name of `remainingToTranslate`. */
  resteATraduire: number;
  /** @deprecated Former name of `remainingJaChars`. */
  signesJaRestants: number;
  /** @deprecated Former name of `sourceQuality` (`saine`, `moyenne` or `a-retranscrire`). */
  qualiteSource: "saine" | "moyenne" | "a-retranscrire";
}

/**
 * Translation queue status of all the databooks. The French fields at the
 * bottom are the former names, served as deprecated duplicates until 1.4.0.
 */
export interface CampaignStats {
  totalWorks: number;
  /** Works with at least one transcribed page left to translate. */
  pendingWorks: number;
  totalPages: number;
  transcribedPages: number;
  translatedPages: number;
  remainingToTranslate: number;
  /** Japanese characters still to translate. */
  remainingJaChars: number;
  topWorks: CampaignWorkStatus[];
  /** @deprecated Former name of `totalWorks`. */
  totalOuvrages: number;
  /** @deprecated Former name of `pendingWorks`. */
  ouvragesEnAttente: number;
  /** @deprecated Former name of `totalPages`. */
  totalPlanches: number;
  /** @deprecated Former name of `transcribedPages`. */
  planchesTranscrites: number;
  /** @deprecated Former name of `translatedPages`. */
  planchesTraduites: number;
  /** @deprecated Former name of `remainingToTranslate`. */
  resteATraduire: number;
  /** @deprecated Former name of `remainingJaChars`. */
  signesJaRestants: number;
  /** @deprecated Former name of `topWorks`. */
  topOuvrages: CampaignWorkStatus[];
}

/**
 * Aggregates translation queue status across all databooks.
 */
export async function getCampaignStats(): Promise<CampaignStats> {
  const rows = await db.execute<{
    id: number;
    title: string;
    category: string | null;
    total_pages: number;
    transcribed: number;
    translated: number;
    faulty: number;
    ja_chars: number;
    ja_chars_untranslated: number;
  }>(sql`
		WITH book_stats AS (
			SELECT
				d.id,
				d.title,
				d.category,
				coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(d.pages) = 'array' THEN d.pages ELSE '[]'::jsonb END), 0)::int AS total_pages,
				(
					SELECT count(*)::int
					FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.pages) = 'array' THEN d.pages ELSE '[]'::jsonb END) elem
					WHERE elem ->> 'text' IS NOT NULL AND length(trim(elem ->> 'text')) > 0
				) AS transcribed,
				(
					SELECT count(*)::int
					FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.pages) = 'array' THEN d.pages ELSE '[]'::jsonb END) elem
					WHERE elem ->> 'text_fr' IS NOT NULL AND length(trim(elem ->> 'text_fr')) > 0
				) AS translated,
				(
					SELECT count(*)::int
					FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.pages) = 'array' THEN d.pages ELSE '[]'::jsonb END) elem
					WHERE coalesce((elem ->> 'verifiee')::boolean, false) = false
					  AND (elem ->> 'text' ~ '[\uFFFD\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\uAC00-\uD7AF]'
					       OR (length(elem ->> 'text') > 20 AND elem ->> 'text' !~ '[\u3040-\u309F\u30A0-\u30FF]'))
				) AS faulty,
				(
					SELECT coalesce(sum(length(elem ->> 'text')), 0)::int
					FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.pages) = 'array' THEN d.pages ELSE '[]'::jsonb END) elem
					WHERE elem ->> 'text' IS NOT NULL
				) AS ja_chars,
				(
					SELECT coalesce(sum(length(elem ->> 'text')), 0)::int
					FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d.pages) = 'array' THEN d.pages ELSE '[]'::jsonb END) elem
					WHERE elem ->> 'text' IS NOT NULL
					  AND (elem ->> 'text_fr' IS NULL OR length(trim(elem ->> 'text_fr')) = 0)
				) AS ja_chars_untranslated
			FROM bot.db_databooks d
		)
		SELECT *
		FROM book_stats
		ORDER BY (transcribed - translated) DESC, id ASC
	`);

  let totalPages = 0;
  let transcribedPages = 0;
  let translatedPages = 0;
  let remainingToTranslate = 0;
  let remainingJaChars = 0;
  let pendingWorks = 0;

  const works: CampaignWorkStatus[] = rows.map((r) => {
    const remaining = Math.max(0, r.transcribed - r.translated);
    totalPages += r.total_pages;
    transcribedPages += r.transcribed;
    translatedPages += r.translated;
    remainingToTranslate += remaining;
    remainingJaChars += r.ja_chars_untranslated;
    if (remaining > 0) pendingWorks++;

    // Rate source quality based on defective plates ratio
    let sourceQuality: SourceQuality = "sound";
    if (r.transcribed > 0 && r.faulty / r.transcribed > 0.3) {
      sourceQuality = "to-retranscribe";
    } else if (r.faulty > 0) {
      sourceQuality = "average";
    }

    return {
      id: r.id,
      title: r.title,
      category: r.category,
      totalPages: r.total_pages,
      transcribed: r.transcribed,
      translated: r.translated,
      faulty: r.faulty,
      remainingToTranslate: remaining,
      remainingJaChars: r.ja_chars_untranslated,
      sourceQuality,
      titre: r.title,
      totalPlanches: r.total_pages,
      transcrites: r.transcribed,
      traduites: r.translated,
      fautives: r.faulty,
      resteATraduire: remaining,
      signesJaRestants: r.ja_chars_untranslated,
      qualiteSource: LEGACY_QUALITY[sourceQuality],
    };
  });
  const topWorks = works.slice(0, 50);

  return {
    totalWorks: rows.length,
    pendingWorks,
    totalPages,
    transcribedPages,
    translatedPages,
    remainingToTranslate,
    remainingJaChars,
    topWorks,
    totalOuvrages: rows.length,
    ouvragesEnAttente: pendingWorks,
    totalPlanches: totalPages,
    planchesTranscrites: transcribedPages,
    planchesTraduites: translatedPages,
    resteATraduire: remainingToTranslate,
    signesJaRestants: remainingJaChars,
    topOuvrages: topWorks,
  };
}

/**
 * Triggers Redis index sync across all databooks.
 */
export async function reindexRedis(): Promise<{ indexed: number; failed: number }> {
  const { items: allBooks } = await listDatabooks({ limit: 1000, includeHidden: true });
  let indexed = 0;
  let failed = 0;

  for (const book of allBooks) {
    try {
      await indexDatabook(book as any);
      indexed++;
    } catch {
      failed++;
    }
  }

  return { indexed, failed };
}
