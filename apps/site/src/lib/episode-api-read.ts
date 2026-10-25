import { dbUniverse, type Episode } from "@/lib/db-universe";

export type PublicEpisodeLookup =
  | { status: "found"; episode: Episode }
  | { status: "missing" }
  | { status: "unavailable" };

/**
 * `dbUniverse.episode()` intentionally degrades query failures to `null` for
 * server-rendered callers. Public APIs need to distinguish that from a real
 * missing row, so confirm absence against the bounded public episode catalogue.
 */
export async function lookupPublicEpisode(id: number): Promise<PublicEpisodeLookup> {
  try {
    const episode = await dbUniverse.episode(id);
    if (episode) return { status: "found", episode };

    const catalogue = await dbUniverse.episodes(undefined, 10_000, 0);
    if (!catalogue) return { status: "unavailable" };

    if (catalogue.episodes.some((candidate) => candidate.id === id)) {
      return { status: "unavailable" };
    }

    return { status: "missing" };
  } catch (error) {
    console.error("[episode-api] public episode lookup failed", error);
    return { status: "unavailable" };
  }
}
