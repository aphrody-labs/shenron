/** Données de l'accueil, telles que `app/page.tsx` les lit et les passe à `HomeView`. */

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

