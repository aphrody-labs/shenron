import type { SearchResults } from "./db-universe";
import { isPathPublic, type AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { formatCharacterSlug, formatTransformationSlug } from "@aphrody/shenron-config/wiki-slugs";

export type WikiSearchGroup = Exclude<keyof SearchResults, "q">;

/** Access resolution consumes a pathname, never a query string or an absolute URL. */
export function isPublicWikiSearchHref(href: string, access: AccessSnapshot): boolean {
  try {
    const url = new URL(href, DEFAULT_PUBLIC_ORIGINS.site);
    const ownOrigins: readonly string[] = [DEFAULT_PUBLIC_ORIGINS.site, DEFAULT_PUBLIC_ORIGINS.api];
    return !ownOrigins.includes(url.origin) || isPathPublic(url.pathname, access);
  } catch {
    return false;
  }
}
type Route = { key: WikiSearchGroup; category: string; root: string; detail?: boolean };
const routes: Route[] = [
  { key: "characters", category: "characters", root: "/wiki/characters", detail: true },
  { key: "planets", category: "locations", root: "/wiki/locations" },
  { key: "races", category: "races", root: "/wiki/races", detail: true },
  { key: "transformations", category: "transformations", root: "/wiki/transformations" },
  { key: "techniques", category: "techniques", root: "/wiki/techniques", detail: true },
  { key: "sagas", category: "sagas", root: "/wiki/sagas", detail: true },
  { key: "arcs", category: "arcs", root: "/wiki/arcs", detail: true },
  { key: "movies", category: "movies", root: "/wiki/movies", detail: true },
  { key: "episodes", category: "episodes", root: "/wiki/episodes", detail: true },
  { key: "games", category: "games", root: "/wiki/games", detail: true },
  { key: "mangaVolumes", category: "manga", root: "/wiki/manga/volume", detail: true },
  { key: "mangaChapters", category: "manga", root: "/wiki/manga", detail: true },
  { key: "battles", category: "events", root: "/wiki/events" },
  { key: "locations", category: "locations", root: "/wiki/locations", detail: true },
  { key: "tournaments", category: "events", root: "/wiki/events" },
  { key: "voiceActors", category: "staff", root: "/wiki/staff?tier=voice" },
  { key: "soundtracks", category: "music", root: "/wiki/music" },
  { key: "powerLevels", category: "power-levels", root: "/wiki/power-levels" },
  { key: "items", category: "items", root: "/wiki/items", detail: true },
  { key: "dragons", category: "dragons", root: "/wiki/dragons" },
  { key: "databooks", category: "databooks", root: "/wiki/databooks", detail: true },
  { key: "novels", category: "manga", root: "/wiki/manga" },
  { key: "contributors", category: "staff", root: "/wiki/contributors", detail: true },
];
function text(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (typeof row[key] === "string" && row[key]) return row[key] as string;
  return "";
}
export function buildWikiSearchSections(results: SearchResults, access: AccessSnapshot | null) {
  return routes.flatMap((route) => {
    if (access && !isPublicWikiSearchHref(route.root, access)) return [];
    const records = results[route.key];
    if (!records.length) return [];
    const entries = records.map((source) => {
      const row = source as unknown as Record<string, unknown>;
      const title =
        text(row, "name", "title", "character_name") ||
        [row.series, row.volume_number ?? row.chapter_number ?? row.id]
          .filter((value) => value != null)
          .join(" · ");
      const identity = String(row.slug ?? row.id);
      const href =
        route.key === "characters"
          ? `/wiki/characters/${formatCharacterSlug({ id: Number(row.id), name: title })}`
          : route.detail
            ? `${route.root}/${encodeURIComponent(identity)}`
            : route.key === "transformations"
              ? `/wiki/transformations/${formatTransformationSlug({ id: Number(row.id), name: title })}`
              : route.key === "dragons"
                ? `${route.root}#${encodeURIComponent(identity)}`
                : route.root;
      return {
        id: String(row.id),
        title,
        href,
        image: text(row, "image", "cover"),
        subtitle: text(row, "name_ja", "title_ja"),
        meta: [
          text(row, "series", "race", "category", "saga", "nationality", "track_type"),
          text(row, "power_value_formatted", "battle_or_context", "creator"),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
    return [{ key: route.key, category: route.category, entries }];
  });
}
