// SPDX-License-Identifier: Apache-2.0
import { slugDeRace } from "@aphrody/shenron-config/races-alias";
import { assetUrl } from "./assets";
import { mangaLibraryImageUrl } from "./manga-library-image";

export type PortalArtRecord = {
  id?: number | string;
  slug?: string;
  name?: string;
  title?: string | null;
  race?: string | null;
  image?: string | null;
  cover?: string | null;
  poster?: string | null;
};
export type PortalArtwork = { image: string; alt: string; entityId?: string | number };
export type PortalMascot = PortalArtwork & { key: "goku" | "kid-buu" | "shenron"; href: string };

/** Relative dbz art belongs to the site's existing public mount, not the retired bot path. */
export function portalArtworkUrl(path: string): string {
  return assetUrl(path.replace(/^\.\/dbz\//, "/dbz/"));
}

function artwork(record?: PortalArtRecord, manga = false): PortalArtwork | undefined {
  const path = record?.image || record?.cover || record?.poster;
  if (!path) return undefined;
  return {
    image: manga ? mangaLibraryImageUrl(path) : portalArtworkUrl(path),
    alt: record?.name ?? record?.title ?? "",
    entityId: record?.id,
  };
}

export function wikiPortalArtwork(input: {
  characters: readonly PortalArtRecord[];
  transformations: readonly PortalArtRecord[];
  sagas: readonly PortalArtRecord[];
  items: readonly PortalArtRecord[];
  locations: readonly PortalArtRecord[];
  movies: readonly PortalArtRecord[];
  episodes: readonly PortalArtRecord[];
  manga: readonly PortalArtRecord[];
  databooks: readonly PortalArtRecord[];
  games: readonly PortalArtRecord[];
  battles?: readonly PortalArtRecord[];
  card?: PortalArtRecord;
}): Record<string, PortalArtwork | undefined> {
  const piccolo = input.characters.find(
    (entry) => entry.id === 3 && slugDeRace(entry.race ?? "", entry.name ?? "") === "namekian",
  );
  const illustrated = (records: readonly PortalArtRecord[]) =>
    records.find((entry) => entry.image || entry.cover || entry.poster);
  return {
    characters: artwork(input.characters.find((entry) => entry.id === 1)),
    races: artwork(piccolo),
    transformations: artwork(input.transformations.find((entry) => entry.id === 1)),
    sagas: artwork(illustrated(input.sagas)),
    "power-levels": artwork(input.items.find((entry) => entry.slug === "scouter")),
    items: artwork(input.items.find((entry) => entry.slug === "dragon-radar")),
    locations: artwork(illustrated(input.locations)),
    movies: artwork(illustrated(input.movies)),
    episodes: artwork(illustrated(input.episodes)),
    manga: artwork(illustrated(input.manga), true),
    databooks: artwork(illustrated(input.databooks)),
    games: artwork(illustrated(input.games)),
    events: artwork(illustrated(input.battles ?? [])),
    cards: artwork(input.card),
  };
}

/** Curated source identities, never the first available character or a substitute form. */
export function wikiPortalMascots(
  characters: readonly PortalArtRecord[],
  dragons: readonly PortalArtRecord[],
): PortalMascot[] {
  const selections = [
    {
      key: "goku" as const,
      record: characters.find((entry) => entry.id === 1),
      href: "/wiki/characters/1",
    },
    {
      key: "kid-buu" as const,
      record: characters.find((entry) => entry.id === 90),
      href: "/wiki/characters/90",
    },
    {
      key: "shenron" as const,
      record: dragons.find((entry) => entry.slug === "shenron"),
      href: "/wiki/characters#dragon-shenron",
    },
  ];
  return selections.flatMap(({ key, record, href }) => {
    const art = artwork(record);
    return art ? [{ ...art, key, href }] : [];
  });
}

/** Server-selected hour is passed to the client, so hydration never samples a second clock. */
export function portalFeaturedKey(mascots: readonly PortalMascot[], window: number) {
  return mascots.length ? mascots[Math.abs(Math.trunc(window)) % mascots.length]!.key : undefined;
}

export type PortalPublication = {
  id: string;
  title: string;
  href: string;
  date: number;
  image?: string;
};
export function recentPortalPublications(items: readonly PortalPublication[], now: number) {
  return items
    .filter((entry) => entry.date > 0 && entry.date <= now && entry.image)
    .toSorted((a, b) => b.date - a.date || a.id.localeCompare(b.id))
    .slice(0, 3);
}
