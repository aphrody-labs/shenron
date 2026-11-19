// SPDX-License-Identifier: Apache-2.0

export const STORE_IDS = ["steam", "appstore", "fdroid", "microsoft"] as const;
export type StoreId = (typeof STORE_IDS)[number];

export interface StorePrice {
  /** Price in the currency's major unit, null when the store gives none. */
  amount: number | null;
  /** ISO 4217 code, null when the store gives none. */
  currency: string | null;
  /** The price exactly as the store shows it. */
  formatted: string | null;
  free: boolean;
}

/** One product of one store in one region: the shape every connector returns. */
export interface StoreListing {
  store: StoreId;
  /** The store's own identifier (Steam app id, App Store track id, F-Droid package, Microsoft product id). */
  storeId: string;
  /** Storefront country or market, lower case (`us`, `jp`, `fr`). */
  region: string;
  title: string;
  url: string;
  publisher: string | null;
  developer: string | null;
  /** ISO date `YYYY-MM-DD`, null when unreleased or unknown. */
  releaseDate: string | null;
  platforms: string[];
  price: StorePrice | null;
  /** Average rating on a 0 to 5 scale, null when the store gives none. */
  rating: number | null;
  ratingCount: number | null;
  /** True for DLC, packs and bundles, false for the base game or app. */
  addon: boolean;
}

export interface SearchOptions {
  /** Storefront country (`us`, `jp`, `fr`). */
  region: string;
  /** Interface language where the store accepts one. */
  language?: string;
  signal?: AbortSignal;
}

export interface StoreConnector {
  readonly id: StoreId;
  search(term: string, options: SearchOptions): Promise<StoreListing[]>;
}
