/**
 * legacy-routes — the former French addresses of the site and their English homes.
 *
 * Routes, API paths and query parameters are English; an address that was once
 * published keeps answering. This module is the single table of those moves:
 *
 *  - `PUBLIC_ROUTE_RENAMES`: public pages, answered with a 308 by `next.config.ts`
 *    (`redirects()`), before the proxy and before any render;
 *  - `STAFF_ROUTE_RENAMES`: administration and staff tools, answered with a 308 by
 *    `proxy.ts` AFTER the staff guard (an anonymous visitor learns nothing);
 *  - `API_ROUTE_ALIASES`: site API paths, served by the new handler through a
 *    `beforeFiles` rewrite (no redirect: a POST must not be turned into a GET, and
 *    the bot, the plugin and the MCP server still call some of them).
 *
 * Pure and import-free on purpose: `next.config.ts` loads it by relative path.
 * `tests/english-routes.test.ts` checks every target against `src/app`.
 */

export interface RouteRename {
  /** Former prefix (French segment), exact match or followed by `/`. */
  readonly from: string;
  /** Target of the exact former address. */
  readonly to: string;
  /** Prefix that receives the sub-paths (defaults to `to`). */
  readonly restTo?: string;
  /** `false`: sub-paths are dropped and land on `to` (retired section merged into a hub). */
  readonly keepRest?: boolean;
  /** Only the exact address moves; sub-paths belong to another table. */
  readonly exact?: boolean;
}

/** Public pages. More specific prefixes come first. */
export const PUBLIC_ROUTE_RENAMES: readonly RouteRename[] = [
  // Encyclopaedia sections.
  { from: "/wiki/personnages", to: "/wiki/characters" },
  { from: "/wiki/lieux", to: "/wiki/locations" },
  { from: "/wiki/objets", to: "/wiki/items" },
  { from: "/wiki/evenements", to: "/wiki/events" },
  { from: "/wiki/musiques", to: "/wiki/music" },
  { from: "/wiki/puissances", to: "/wiki/power-levels" },
  { from: "/wiki/chronologie", to: "/wiki/timeline" },
  { from: "/wiki/jeux", to: "/wiki/games" },
  { from: "/wiki/contribuer", to: "/wiki/contribute" },
  // The contributors index was merged into the staff page; profiles stay.
  { from: "/wiki/contributeurs", to: "/wiki/staff", restTo: "/wiki/contributors" },
  { from: "/wiki/corriger", to: "/wiki/corrections" },
  { from: "/wiki/films", to: "/wiki/movies" },
  { from: "/wiki/hasard", to: "/wiki/random" },
  { from: "/wiki/episodes/serie", to: "/wiki/episodes/series" },
  { from: "/wiki/manga/revue", to: "/wiki/manga/review" },
  // Retired sections, merged into their hub (former and English names alike).
  { from: "/wiki/combats", to: "/wiki/events", keepRest: false },
  { from: "/wiki/battles", to: "/wiki/events", keepRest: false },
  { from: "/wiki/tournois", to: "/wiki/events", keepRest: false },
  { from: "/wiki/tournaments", to: "/wiki/events", keepRest: false },
  { from: "/wiki/voix", to: "/wiki/staff", keepRest: false },
  { from: "/wiki/voice-actors", to: "/wiki/staff", keepRest: false },
  { from: "/wiki/romans", to: "/wiki/manga", keepRest: false },
  { from: "/wiki/novels", to: "/wiki/manga", keepRest: false },
  { from: "/wiki/dragons", to: "/wiki/characters", keepRest: false },
  { from: "/wiki/cosmologie", to: "/wiki/locations", keepRest: false },
  { from: "/wiki/planetes", to: "/wiki/locations", keepRest: false },
  { from: "/wiki/autour-de-dragon-ball", to: "/wiki/staff", keepRest: false },
  // Site sections.
  { from: "/jeux/morpion", to: "/games/tic-tac-toe" },
  { from: "/jeux/pfc", to: "/games/rock-paper-scissors" },
  { from: "/jeux", to: "/games" },
  { from: "/classements", to: "/rankings" },
  { from: "/confidentialite", to: "/privacy" },
  { from: "/licence", to: "/license" },
  { from: "/parametres", to: "/settings" },
  { from: "/profil", to: "/profile/me", restTo: "/profile" },
  { from: "/favoris", to: "/favorites" },
  { from: "/plan-du-site", to: "/site-map" },
  { from: "/wiki-bientot", to: "/coming-soon" },
  { from: "/tierlists/creer", to: "/tierlists/new" },
  { from: "/tierlists/mes", to: "/tierlists/mine" },
  { from: "/news/fil", to: "/news/feed" },
  // Only the public overview of the workshop: its staff tools move in the proxy.
  { from: "/atelier", to: "/workshop", exact: true },
  // Shenron Studio: the translation editor left its code name (`/koharu`) for `/studio`; the
  // desktop home (`/bureau`) is `/desktop`. The former `/studio` (desktop control page) is
  // now `/desktop/control` and cannot be redirected: `/studio` is the editor.
  { from: "/koharu", to: "/studio" },
  { from: "/bureau", to: "/desktop" },
];

/** Staff tools of the workshop (guarded like `/admin`). */
export const WORKSHOP_STAFF_PREFIXES = [
  "/workshop/transcription",
  "/workshop/translation",
  "/workshop/databooks",
] as const;

/**
 * Administration and staff addresses, redirected by the proxy after its guard.
 * `/admin/databooks` and `/admin/transcriptions` predate the workshop.
 */
export const STAFF_ROUTE_RENAMES: readonly RouteRename[] = [
  { from: "/atelier/transcription", to: "/workshop/transcription" },
  { from: "/atelier/traduction", to: "/workshop/translation" },
  // `/workshop/databooks` seul n'a pas de page : la liste des ouvrages est l'onglet Transcription.
  { from: "/atelier/databooks", to: "/workshop/transcription", restTo: "/workshop/databooks" },
  { from: "/admin/transcriptions", to: "/workshop/transcription", keepRest: false },
  { from: "/admin/databooks", to: "/workshop/translation", restTo: "/workshop/databooks" },
  { from: "/admin/activite", to: "/admin/activity" },
  { from: "/admin/campagnes-bxc", to: "/admin/bxc-campaigns" },
  { from: "/admin/chronologie", to: "/admin/timeline" },
  { from: "/admin/concours", to: "/admin/contests" },
  { from: "/admin/ia", to: "/admin/ai" },
  { from: "/admin/assistance-ia", to: "/admin/ai?tab=overview", keepRest: false },
  { from: "/admin/lancement", to: "/admin/launch" },
  { from: "/admin/signalements", to: "/admin/reports" },
  { from: "/admin/ursaf", to: "/admin/taxes" },
  { from: "/admin/visibilite", to: "/admin/visibility" },
  { from: "/admin/commandes", to: "/admin/command-runner" },
  { from: "/admin/moderation/commentaires", to: "/admin/moderation/comments" },
  { from: "/admin/db-universe/films", to: "/admin/db-universe/movies" },
];

/**
 * Site API paths kept as aliases of their English handler. `:name` segments are
 * carried over; anything after the prefix too.
 */
export const API_ROUTE_ALIASES: readonly { readonly from: string; readonly to: string }[] = [
  { from: "/api/chronologie", to: "/api/timeline" },
  { from: "/api/chronologie-config", to: "/api/timeline-config" },
  { from: "/api/admin/entites", to: "/api/admin/entities" },
  { from: "/api/admin/ia", to: "/api/admin/ai" },
  { from: "/api/admin/databooks/campagne", to: "/api/admin/databooks/campaign" },
  { from: "/api/databooks/:id/textes", to: "/api/databooks/:id/texts" },
  { from: "/api/databooks/:id/relecture-ocr", to: "/api/databooks/:id/ocr-review" },
  {
    from: "/api/manga/chapter/:id/planche/:n/traduction",
    to: "/api/manga/chapter/:id/pages/:n/translation",
  },
  { from: "/api/manga/chapter/:id/planche", to: "/api/manga/chapter/:id/pages" },
];

const within = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * English address of a former one, or `null`. The first matching rule wins
 * (tables list the specific prefixes first). The caller keeps the query string.
 */
export function renameLegacyPath(pathname: string, table: readonly RouteRename[]): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const rule of table) {
    if (rule.exact ? path !== rule.from : !within(path, rule.from)) continue;
    if (path === rule.from || rule.keepRest === false) return rule.to;
    return `${rule.restTo ?? rule.to}${path.slice(rule.from.length)}`;
  }
  return null;
}

/** Former public address → English one (308 in `next.config.ts`). */
export function publicLegacyRedirect(pathname: string): string | null {
  return renameLegacyPath(pathname, PUBLIC_ROUTE_RENAMES);
}

/** Former staff address → English one (308 in `proxy.ts`, after the guard). */
export function staffLegacyRedirect(pathname: string): string | null {
  return renameLegacyPath(pathname, STAFF_ROUTE_RENAMES);
}

/** `next.config.ts` `redirects()` entries of a rename table. */
export function nextRedirectsOf(table: readonly RouteRename[]) {
  return table.flatMap((rule) => [
    { source: rule.from, destination: rule.to, permanent: true },
    ...(rule.exact
      ? []
      : [
          {
            source: `${rule.from}/:rest+`,
            destination: rule.keepRest === false ? rule.to : `${rule.restTo ?? rule.to}/:rest+`,
            permanent: true,
          },
        ]),
  ]);
}

/** `next.config.ts` `beforeFiles` rewrites serving the API aliases. */
export function nextApiRewrites() {
  return API_ROUTE_ALIASES.flatMap((alias) => [
    { source: alias.from, destination: alias.to },
    { source: `${alias.from}/:rest+`, destination: `${alias.to}/:rest+` },
  ]);
}
