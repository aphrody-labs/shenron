// SPDX-License-Identifier: Apache-2.0
/** Route identity is shared by the visual frame and server-rendered catalogue cards. */
export const WIKI_VISUAL_TOPICS = {
  races: "namek",
  transformations: "energy",
  sagas: "adventure",
  arcs: "adventure",
  "power-levels": "energy",
  items: "capsule",
  locations: "namek",
  dragons: "namek",
  events: "adventure",
  timeline: "adventure",
  music: "cosmos",
  movies: "cinema",
  episodes: "cinema",
  manga: "archive",
  games: "capsule",
  databooks: "archive",
  cards: "energy",
  canon: "archive",
  toriyama: "archive",
  interviews: "archive",
  staff: "community",
  contributors: "community",
  contribute: "community",
  corrections: "community",
  tools: "capsule",
  search: "capsule",
  gifs: "cinema",
} as const;

export type WikiVisualTopic = (typeof WIKI_VISUAL_TOPICS)[keyof typeof WIKI_VISUAL_TOPICS];

/** Respect the owner's exclusions on initial SSR and every client navigation. */
export function wikiVisualSection(pathname: string | null): string | null {
  if (!pathname || !/^\/wiki(?:\/|$)/.test(pathname)) return null;
  const section = pathname.split("/")[2] ?? "";
  if (section === "characters" || section === "techniques") return null;
  return section || "portal";
}

export function wikiVisualTopic(section: string | null | undefined): WikiVisualTopic {
  return WIKI_VISUAL_TOPICS[section as keyof typeof WIKI_VISUAL_TOPICS] ?? "adventure";
}

export function wikiSourceSection(source: string): string {
  return source.replace(/^db_/, "");
}

/** Existing catalogue pages identify their editorial domain through the contribution key. */
export function wikiContributionSection(key: string | undefined): string | undefined {
  const kind = key?.split(".").at(-1);
  const sections: Record<string, string> = {
    race: "races",
    transformation: "transformations",
    saga: "sagas",
    arc: "arcs",
    object: "items",
    place: "locations",
    dragon: "dragons",
    music: "music",
    movie: "movies",
    episode: "episodes",
    volume: "manga",
    game: "games",
    databookPlate: "databooks",
    interview: "interviews",
    power: "power-levels",
    battle: "events",
    tournament: "events",
    voice: "staff",
  };
  return kind ? sections[kind] : undefined;
}
