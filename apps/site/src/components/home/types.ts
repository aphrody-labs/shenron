/** Données de l'accueil, telles que `app/page.tsx` les lit et les passe à `HomeView`. */

export interface WikiCounts {
  sagas: number;
  episodes: number;
  movies: number;
  characters: number;
  planets: number;
  chapters: number;
  databooks: number;
}

export interface FeaturedCharacter {
  id: number;
  name: string;
  nameJa: string | null;
  race: string | null;
  ki: string | null;
  image: string | null;
}

export interface SagaTeaser {
  id: number;
  slug: string | null;
  name: string;
  series: string | null;
  description: string | null;
}

export const EMPTY_WIKI_COUNTS: WikiCounts = {
  sagas: 0,
  episodes: 0,
  movies: 0,
  characters: 0,
  planets: 0,
  chapters: 0,
  databooks: 0,
};
