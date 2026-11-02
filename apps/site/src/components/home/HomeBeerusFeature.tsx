/**
 * Shape of the DB Beerus data the home page hands to the hero. The hero itself is rendered
 * by `HomeBeerusCarousel` (one slide per aired episode); see `beerus-slides.ts`.
 */
export interface BeerusEpisodeSummary {
  id: number;
  number: number | null;
  title: string;
  titleJa?: string | null;
  airDate?: number | null;
  duration?: number | null;
  image?: string;
}

export interface BeerusFeature {
  total: number;
  latest: BeerusEpisodeSummary | null;
  episodes?: BeerusEpisodeSummary[];
}
