// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { endpoints, VfsInfoResponse } from "@aphrody/shenron-api/contract";
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";
import { db } from "./db";

export interface PublicCorpusStats {
  ragChunks: number | null;
  canonReferences: number | null;
  databookPages: number | null;
  mangaPages: number | null;
  mangaVolumes: number | null;
  mangaChapters: number | null;
  episodes: number | null;
  characters: number | null;
}

const unknownCounts = (): PublicCorpusStats => ({
  ragChunks: null,
  canonReferences: null,
  databookPages: null,
  mangaPages: null,
  mangaVolumes: null,
  mangaChapters: null,
  episodes: null,
  characters: null,
});

const count = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/** Current editorial records and the public host index; absence is never a made-up zero. */
export const getPublicCorpusStats = cache(async (): Promise<PublicCorpusStats> => {
  const result = unknownCounts();
  await Promise.all([
    (async () => {
      try {
        const [row] = await db.execute<Record<string, unknown>>(sql`
          SELECT
            (SELECT count(*) FROM public.canon_references WHERE visible) AS "canonReferences",
            (SELECT count(*) FROM bot.db_databooks b
              CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(b.pages) = 'array' THEN b.pages ELSE '[]'::jsonb END
              ) p WHERE b.visible AND
                (length(trim(coalesce(p->>'image',''))) > 0 OR
                 length(trim(coalesce(p->>'text',''))) > 0)) AS "databookPages",
            (SELECT count(*) FROM bot.db_manga_pages p WHERE EXISTS (
              SELECT 1 FROM bot.db_manga_chapters c
              JOIN bot.db_manga_volumes v ON v.id = c.volume_id AND v.visible
              WHERE c.visible AND p.series = c.series
                AND c.series IN ('DB', 'DBS', 'DBKZ', 'SOSH', 'DBJP', 'DBZ_ANIME_COMICS', 'DB_MOVIES', 'ARALE')
                AND p.tome = CASE WHEN c.series = 'DBS'
                  THEN 'ch' || c.id ELSE 'vol' || c.chapter_number END
            )) AS "mangaPages",
            (SELECT count(*) FROM bot.db_manga_volumes WHERE visible) AS "mangaVolumes",
            (SELECT count(*) FROM bot.db_manga_chapters WHERE visible) AS "mangaChapters",
            (SELECT count(*) FROM bot.db_episodes WHERE visible) AS "episodes",
            (SELECT count(*) FROM bot.db_characters WHERE visible) AS "characters"
        `);
        if (row)
          for (const key of Object.keys(result) as (keyof PublicCorpusStats)[])
            if (key !== "ragChunks") result[key] = count(row[key]);
      } catch {
        // An unavailable editorial database is not an empty corpus.
      }
    })(),
    (async () => {
      const host = resolveHostUrl(process.env);
      if (!host) return;
      try {
        const response = await fetch(new URL(endpoints.vfsInfo.path, host), {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) return;
        const parsed = VfsInfoResponse.safeParse(await response.json());
        if (parsed.success) result.ragChunks = count(parsed.data.rag.chunks);
      } catch {
        // Public index metadata may be unavailable independently of PostgreSQL.
      }
    })(),
  ]);
  return result;
});
