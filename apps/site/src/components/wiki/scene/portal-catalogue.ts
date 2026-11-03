// SPDX-License-Identifier: Apache-2.0
export const WIKI_PORTAL_USAGES = ["universe", "stories", "media", "documents"] as const;
export type PortalUsage = (typeof WIKI_PORTAL_USAGES)[number];
export type PortalSection = { id: string; href: string; usage: PortalUsage; countKey?: string };

/** Presentation only: the server filters these destinations through the publication owner. */
export const WIKI_PORTAL_SECTIONS: readonly PortalSection[] = [
  { id: "characters", href: "/wiki/characters", usage: "universe", countKey: "characters" },
  { id: "races", href: "/wiki/races", usage: "universe", countKey: "races" },
  {
    id: "transformations",
    href: "/wiki/transformations",
    usage: "universe",
    countKey: "transformations",
  },
  { id: "techniques", href: "/wiki/techniques", usage: "universe", countKey: "techniques" },
  { id: "power-levels", href: "/wiki/power-levels", usage: "universe", countKey: "powerLevels" },
  { id: "items", href: "/wiki/items", usage: "universe", countKey: "items" },
  { id: "locations", href: "/wiki/locations", usage: "universe", countKey: "locations" },
  { id: "sagas", href: "/wiki/sagas", usage: "stories", countKey: "sagas" },
  { id: "arcs", href: "/wiki/arcs", usage: "stories", countKey: "arcs" },
  { id: "events", href: "/wiki/events", usage: "stories" },
  { id: "timeline", href: "/wiki/timeline", usage: "stories" },
  {
    id: "dragons",
    href: "/wiki/characters#dragons-personnages",
    usage: "stories",
    countKey: "dragons",
  },
  { id: "episodes", href: "/wiki/episodes", usage: "media", countKey: "episodes" },
  { id: "movies", href: "/wiki/movies", usage: "media", countKey: "movies" },
  { id: "games", href: "/wiki/games", usage: "media", countKey: "games" },
  { id: "music", href: "/wiki/music", usage: "media", countKey: "soundtracks" },
  { id: "gifs", href: "/wiki/gifs", usage: "media" },
  { id: "cards", href: "/wiki/cards", usage: "media", countKey: "cardCatalogCards" },
  { id: "manga", href: "/wiki/manga", usage: "documents", countKey: "mangaVolumes" },
  { id: "databooks", href: "/wiki/databooks", usage: "documents", countKey: "databooks" },
  { id: "interviews", href: "/wiki/interviews", usage: "documents" },
  { id: "toriyama", href: "/wiki/toriyama", usage: "documents" },
  { id: "canon", href: "/wiki/canon", usage: "documents" },
  { id: "staff", href: "/wiki/staff", usage: "documents" },
  { id: "tools", href: "/wiki/tools", usage: "documents", countKey: "tools" },
];

export function portalAllowsHref(href: string, sections: readonly PortalSection[]) {
  return sections.some((entry) => {
    const path = entry.href.split(/[?#]/, 1)[0]!;
    return href === entry.href || href === path || href.startsWith(`${path}/`);
  });
}
