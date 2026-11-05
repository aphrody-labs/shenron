/**
 * Registre des pages d'administration : identifiant de traduction
 * (`admin.pages.<id>`), rubrique et route. Une page rend son en-tête par
 * `<AdminPageHeading page="…" />` ; ce registre relie l'identifiant à sa rubrique
 * (le surtitre) et permet aux tests de vérifier que chaque `page.tsx` a le sien.
 *
 * Les routes dynamiques gardent leur segment (`[id]`), comme dans `src/app`.
 */
export const ADMIN_FAMILIES = [
  "pilotage",
  "site",
  "systeme",
  "encyclopedie",
  "communaute",
  "economie",
  "securite",
] as const;

export type AdminFamily = (typeof ADMIN_FAMILIES)[number];

export const ADMIN_PAGES = {
  dashboard: { family: "pilotage", route: "/admin/dashboard" },
  sync: { family: "pilotage", route: "/admin/sync" },
  bot: { family: "pilotage", route: "/admin/bot" },
  botDetail: { family: "pilotage", route: "/admin/bot/[id]" },
  console: { family: "pilotage", route: "/admin/console" },
  send: { family: "pilotage", route: "/admin/send" },
  commandRunner: { family: "pilotage", route: "/admin/command-runner" },

  home: { family: "site", route: "/admin/home" },
  design: { family: "site", route: "/admin/design" },
  posts: { family: "site", route: "/admin/posts" },
  postNew: { family: "site", route: "/admin/posts/new" },
  postEdit: { family: "site", route: "/admin/posts/[id]" },
  banners: { family: "site", route: "/admin/banners" },
  monetization: { family: "site", route: "/admin/monetization" },

  logs: { family: "systeme", route: "/admin/logs" },
  settings: { family: "systeme", route: "/admin/settings" },
  events: { family: "systeme", route: "/admin/events" },
  cron: { family: "systeme", route: "/admin/cron" },
  services: { family: "systeme", route: "/admin/services" },
  live: { family: "systeme", route: "/admin/live" },
  stats: { family: "systeme", route: "/admin/stats" },
  activity: { family: "systeme", route: "/admin/activity" },
  ai: { family: "systeme", route: "/admin/ai" },
  triggers: { family: "systeme", route: "/admin/triggers" },
  webhooks: { family: "systeme", route: "/admin/webhooks" },
  database: { family: "systeme", route: "/admin/database" },
  databaseTable: { family: "systeme", route: "/admin/database/[table]" },
  agents: { family: "systeme", route: "/admin/agents" },
  a2a: { family: "systeme", route: "/admin/a2a" },
  apiDocs: { family: "systeme", route: "/admin/api-docs" },

  launch: { family: "encyclopedie", route: "/admin/launch" },
  visibility: { family: "encyclopedie", route: "/admin/visibility" },
  sources: { family: "encyclopedie", route: "/admin/db-universe/sources" },
  assets: { family: "encyclopedie", route: "/admin/db-universe/assets" },
  sagas: { family: "encyclopedie", route: "/admin/db-universe/sagas" },
  episodes: { family: "encyclopedie", route: "/admin/db-universe/episodes" },
  movies: { family: "encyclopedie", route: "/admin/db-universe/movies" },
  games: { family: "encyclopedie", route: "/admin/db-universe/games" },
  dbDatabooks: { family: "encyclopedie", route: "/admin/db-universe/databooks" },
  timeline: { family: "encyclopedie", route: "/admin/timeline" },
  wiki: { family: "encyclopedie", route: "/admin/wiki" },
  wikiHistory: { family: "encyclopedie", route: "/admin/wiki/history" },
  wikiCategoryNew: { family: "encyclopedie", route: "/admin/wiki/category/new" },
  wikiCategoryEdit: { family: "encyclopedie", route: "/admin/wiki/category/[id]" },
  wikiPageNew: { family: "encyclopedie", route: "/admin/wiki/page/new" },
  wikiPageEdit: { family: "encyclopedie", route: "/admin/wiki/page/[id]" },
  wikiTodo: { family: "encyclopedie", route: "/admin/wiki/todo" },
  wikiStudio: { family: "encyclopedie", route: "/admin/wiki/studio/[table]/[id]" },

  discord: { family: "communaute", route: "/admin/discord" },
  profile: { family: "communaute", route: "/admin/profile" },
  canvas: { family: "communaute", route: "/admin/canvas" },
  canvasThemes: { family: "communaute", route: "/admin/canvas/themes" },
  giveaways: { family: "communaute", route: "/admin/giveaways" },
  tickets: { family: "communaute", route: "/admin/tickets" },
  reports: { family: "communaute", route: "/admin/reports" },
  wikiContributions: { family: "communaute", route: "/admin/wiki/contributions" },
  tierlists: { family: "communaute", route: "/admin/tierlists" },
  tierlistNew: { family: "communaute", route: "/admin/tierlists/new" },
  tierlistEdit: { family: "communaute", route: "/admin/tierlists/[id]" },
  messages: { family: "communaute", route: "/admin/messages" },

  economy: { family: "economie", route: "/admin/economy" },
  levels: { family: "economie", route: "/admin/levels" },
  shop: { family: "economie", route: "/admin/shop" },
  leaderboards: { family: "economie", route: "/admin/leaderboards" },
  taxes: { family: "economie", route: "/admin/taxes" },
  contests: { family: "economie", route: "/admin/contests" },

  account: { family: "securite", route: "/admin/account" },
  audit: { family: "securite", route: "/admin/audit" },
  moderation: { family: "securite", route: "/admin/moderation" },
  moderationComments: { family: "securite", route: "/admin/moderation/comments" },
  auditInternal: { family: "securite", route: "/admin/audit-internal" },
  hierarchy: { family: "securite", route: "/admin/hierarchy" },
  commands: { family: "securite", route: "/admin/commands" },
  access: { family: "securite", route: "/admin-access" },
} as const satisfies Record<string, { family: AdminFamily; route: string }>;

export type AdminPageId = keyof typeof ADMIN_PAGES;

/** Static routes outrank parameter routes; descendants inherit their closest workspace. */
export function adminPageForPath(pathname: string): AdminPageId | null {
  const path = pathname.split("?")[0];
  const entries = Object.entries(ADMIN_PAGES) as [
    AdminPageId,
    { route: string; family: AdminFamily },
  ][];
  entries.sort(
    (a, b) =>
      b[1].route.split("/").length - a[1].route.split("/").length ||
      Number(a[1].route.includes("[")) - Number(b[1].route.includes("[")),
  );
  return (
    entries.find(([, value]) => {
      const route = value.route
        .split("/")
        .map((segment) => (segment.startsWith("[") ? "[^/]+" : segment))
        .join("/");
      return new RegExp(`^${route}(?:/|$)`).test(path);
    })?.[0] ?? null
  );
}
