/**
 * shell-nav — the public navigation of the app shell, derived from the site map.
 *
 * The public shell carries reader destinations only. Administration has its own navigation
 * (`components/admin/AdminSidebar.tsx`, mounted by `app/admin/layout.tsx` through
 * `ShellContextNav`), and staff tools stay reachable from their own pages (the Library tabs,
 * the site map), never from the public sidebar or the mobile sheet. `tests/shell-nav.test.ts`
 * holds the rule.
 *
 * Client-safe: no database access; the caller passes the launch configuration snapshot.
 */
import { buildSiteMap, type Journey } from "@/lib/site-map";
import { isPathPublic, type AccessSnapshot } from "@/lib/wiki-launch";

/** Journeys rendered in the sidebar; « Le site » (legal pages) lives in the footer. */
export const SIDEBAR_JOURNEYS: readonly Journey[] = [
  "decouvrir",
  "encyclopedie",
  "oeuvres",
  "archives",
  "communaute",
  "participer",
  "espace",
];

/**
 * Internal or staff-facing destinations kept out of the public navigation: production tools
 * (transcription workshop, Shenron Studio, collection sources, modding tools, canvas), and
 * the bot's own pages (personas, commands). Each one keeps its page and its own entry points.
 */
export const SHELL_HIDDEN_HREFS: ReadonlySet<string> = new Set([
  "/workshop",
  "/studio",
  "/sources/dragon-ball",
  "/wiki/tools",
  "/canvas",
  "/personas",
  "/commands",
]);

/** Paths that belong to the administration and never appear in the public shell. */
export function isAdminHref(href: string): boolean {
  return href === "/admin" || href.startsWith("/admin/") || href.startsWith("/admin?");
}

export interface ShellJourney {
  key: Journey;
  label: string;
  items: { href: string; label: string; description?: string; member: boolean }[];
}

/** The public sidebar sections for a launch configuration (`null`: everything open). */
export function publicShellJourneys(
  cfg: (AccessSnapshot & { order?: readonly string[] }) | null,
): ShellJourney[] {
  const isOpen = (href: string) => (cfg ? isPathPublic(href, cfg) : true);
  const rank = new Map((cfg?.order ?? []).map((key, index) => [key, index]));
  return buildSiteMap({ isOpen, includeMember: true, includeStaff: false })
    .filter((group) => SIDEBAR_JOURNEYS.includes(group.journey.key))
    .map((group) => ({
      key: group.journey.key,
      label: group.journey.label,
      items: group.items
        .map((item, index) => ({ item, index }))
        .toSorted(
          (a, b) =>
            (rank.get(a.item.entryKey ?? "") ?? 1000 + a.index) -
            (rank.get(b.item.entryKey ?? "") ?? 1000 + b.index),
        )
        .filter(
          ({ item }) =>
            !item.external &&
            item.audience !== "staff" &&
            !SHELL_HIDDEN_HREFS.has(item.href) &&
            !isAdminHref(item.href),
        )
        .map(({ item }) => ({
          href: item.href,
          label: item.label,
          description: item.blurb,
          member: item.audience === "member",
        })),
    }))
    .filter((journey) => journey.items.length > 0);
}
