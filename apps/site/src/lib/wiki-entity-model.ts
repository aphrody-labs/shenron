// SPDX-License-Identifier: Apache-2.0
/** Pure editorial identity rules shared by admin forms, public panels and API effects. */
const SECTION_ENTITIES = [
  ["character", "db_characters"],
  ["planet", "db_planets"],
  ["saga", "db_sagas"],
  ["arc", "db_arcs"],
  ["race", "db_races"],
  ["technique", "db_techniques"],
  ["game", "db_games"],
  ["movie", "db_movies"],
] as const;

export type WikiSectionEntityType = (typeof SECTION_ENTITIES)[number][0];
export type WikiSectionEntityTable = (typeof SECTION_ENTITIES)[number][1];

export function sectionEntityType(table: string): WikiSectionEntityType | null {
  return SECTION_ENTITIES.find((entry) => entry[1] === table)?.[0] ?? null;
}

export function tableForSectionEntity(entityType: string): WikiSectionEntityTable | null {
  return SECTION_ENTITIES.find((entry) => entry[0] === entityType)?.[1] ?? null;
}
/** Public entity URL; null when the required reader identity or slug is missing. */
export function publicEntityUrl(table: string, row: Record<string, unknown>): string | null {
  const id = row.id;
  const slug = typeof row.slug === "string" && row.slug ? row.slug : null;
  const hasId = id != null && id !== "";
  switch (table) {
    case "db_characters":
      return hasId ? `/wiki/characters/${id}` : null;
    case "db_planets":
      return hasId ? "/wiki/locations" : null;
    case "db_techniques":
      return slug ? `/wiki/techniques/${slug}` : null;
    case "db_games":
      // The public game route uses its canonical slug.
      return slug ? `/wiki/games/${slug}` : null;
    case "db_sagas":
      return slug ? `/wiki/sagas/${slug}` : null;
    case "db_arcs":
      return slug ? `/wiki/arcs/${slug}` : null;
    case "db_races":
      return slug ? `/wiki/races/${slug}` : null;
    case "db_movies":
      return slug ? `/wiki/movies/${slug}` : null;
    case "db_manga_volumes":
      return hasId ? `/wiki/manga/volume/${id}` : null;
    case "media_volumes": {
      // Public volume routes address legacy manga records, never native media IDs.
      const legacyId = Number(row.legacyVolumeId);
      return Number.isSafeInteger(legacyId) && legacyId > 0
        ? `/wiki/manga/volume/${legacyId}`
        : null;
    }
    case "db_databooks":
      return hasId ? `/wiki/databooks/${id}` : "/wiki/databooks";
    case "db_episodes":
      return hasId ? `/wiki/episodes/${id}` : null;
    default:
      return null;
  }
}
