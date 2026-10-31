/**
 * Revalidation ISR des pages publiques du wiki après une écriture éditoriale.
 * Extrait du route handler `/api/wiki-admin` pour être partagé avec le retour
 * arrière (`/api/wiki-history`). Server-only (utilise `next/cache` + `getWikiRow`).
 *
 * Ne JAMAIS laisser une revalidation faire échouer l'écriture : tout est
 * best-effort (try/catch), la source de vérité reste la DB.
 */
import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { getWikiRow } from "@/lib/wiki-admin";
import { publicEntityUrl, tableForSectionEntity } from "@/lib/wiki-entity-model";

/** Pages liste publiques par table (revalidées à chaque écriture). */
const WIKI_LIST_PATHS: Record<string, string[]> = {
  db_characters: ["/wiki/characters"],
  db_character_variants: ["/wiki/characters", "/wiki/sagas"],
  db_character_variant_technique_uses: ["/wiki/characters"],
  db_character_variant_appearances: ["/wiki/characters"],
  db_planets: ["/wiki/locations"],
  db_sagas: ["/wiki/sagas"],
  db_arcs: ["/wiki/sagas"],
  db_movies: ["/wiki/movies"],
  db_games: ["/wiki/games"],
  db_manga_volumes: ["/wiki/manga"],
  db_manga_chapters: ["/wiki/manga"],
  db_episodes: ["/wiki/episodes"],
  db_techniques: ["/wiki/techniques"],
  db_races: ["/wiki/races"],
  db_tools: ["/wiki/tools"],
  db_news: ["/wiki/news"],
  db_databooks: ["/wiki/databooks"],
  media_works: ["/wiki/manga"],
  media_editions: ["/wiki/manga"],
  media_volumes: ["/wiki/manga"],
};

/**
 * Purge le cache ISR des pages publiques impactées par une écriture wiki, pour
 * que l'édition apparaisse tout de suite (au lieu d'attendre la revalidation).
 */
export function revalidateWikiEntity(table: string, row?: Record<string, unknown>): void {
  try {
    for (const p of WIKI_LIST_PATHS[table] ?? []) revalidatePath(p);
    // `sitemap.ts` caches the dynamic entity list for 24 hours. A visible flag,
    // canonical slug, or merge can otherwise leave a deleted character URL in
    // the sitemap until TTL expiry (for example, a stale /characters/c-21).
    if (WIKI_LIST_PATHS[table]) revalidatePath("/sitemap.xml");
    revalidatePath("/wiki");
    const detail = row ? publicEntityUrl(table, row) : null;
    if (detail) revalidatePath(detail);
    // Variant cards join characters and sagas. Their API and character pages
    // must also expire when a parent label, fallback image or visibility changes.
    if (table === "db_character_variants" || table === "db_characters" || table === "db_sagas") {
      revalidatePath("/api/wiki/variants");
      if (table !== "db_characters") {
        revalidatePath("/wiki/characters");
        revalidatePath("/wiki/characters/[slug]", "page");
      }
      // Saga character lists also consume variant roles and character images.
      if (table !== "db_sagas") revalidatePath("/wiki/sagas/[slug]", "page");
    }
    if (table === "db_character_variant_technique_uses") {
      revalidatePath("/wiki/characters/[slug]", "page");
    }
    if (table === "db_character_variant_appearances") {
      revalidatePath("/wiki/characters/[slug]", "page");
    }
    if (table === "db_manga_volumes") {
      revalidatePath("/api/manga");
      revalidatePath("/api/manga/coverage");
      const id = Number(row?.id);
      if (Number.isSafeInteger(id) && id > 0) revalidatePath(`/api/manga/volume/${id}`);
    }
    if (table === "db_episodes") {
      revalidateTag("episode-series", { expire: 0 });
      revalidateTag("episodes-by-series", { expire: 0 });
      if (typeof row?.series === "string") {
        revalidatePath(`/wiki/episodes/series/${encodeURIComponent(row.series)}`);
      }
      revalidatePath("/sitemap.xml");
    }
    // Les transformations n'ont pas de page propre → elles s'affichent sur la
    // fiche du personnage.
    if (table === "db_transformations" && row?.characterId != null) {
      revalidatePath(`/wiki/characters/${row.characterId}`);
    }
  } catch {
    /* best-effort : ne jamais faire échouer l'écriture pour une revalidation */
  }
}

/**
 * Purge la page détail de l'entité parente quand une de ses sections change
 * (best-effort : résout le slug/id via la table parente puis `publicEntityUrl`).
 */
export async function revalidateSectionParent(
  row: Record<string, unknown> | undefined,
): Promise<void> {
  try {
    if (!row) return;
    const entityType = typeof row.entityType === "string" ? row.entityType : "";
    const entityId = row.entityId;
    const table = tableForSectionEntity(entityType);
    if (!table || entityId == null) return;
    const parent = await getWikiRow(table, String(entityId)).catch(() => null);
    const url = parent ? publicEntityUrl(table, parent) : null;
    if (url) revalidatePath(url);
  } catch {
    /* best-effort */
  }
}
