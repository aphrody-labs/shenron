// SPDX-License-Identifier: Apache-2.0

export interface CrunchyrollSeriesMeta {
  id: string;
  title: string;
  slugTitle: string;
  description: string;
  episodeCount?: number;
  seasonCount?: number;
  imageUrl?: string;
}

export interface CrunchyrollEpisodeMeta {
  id: string;
  seriesId: string;
  seasonId?: string;
  episodeNumber: number;
  sequenceNumber?: number;
  title: string;
  slugTitle?: string;
  durationMs: number;
  audioLocale?: string;
  subtitleLocales?: string[];
  description?: string;
  airDate?: string;
  isPremiumOnly?: boolean;
  watchUrl: string;
}

export interface CrunchyrollCatalogQuery {
  q?: string;
  seriesId?: string;
  locale?: string;
}
