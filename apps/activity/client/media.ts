// SPDX-License-Identifier: Apache-2.0
export type MediaType = "episode" | "movie" | "manga" | "databook";

export interface MediaItem {
  readonly id: string;
  readonly type: MediaType;
  readonly title: Record<string, string>;
  readonly url?: string;
  readonly poster?: string;
  readonly pages?: readonly string[];
  readonly totalPages?: number;
}

export const MEDIA_CATALOG: readonly MediaItem[] = [
  {
    id: "ep-879",
    type: "episode",
    title: {
      fr: "Épisode 879 — Dragon Ball Z",
      en: "Episode 879 — Dragon Ball Z",
      ja: "第879話 — ドラゴンボールZ",
    },
    url: "https://cdn.dragonballfr.com/media/episodes/879/ec72611b7375d0b60dc6dbb4e52ff9332ddc151636d60d89a08fb1cd4107d95a/source.mp4",
    poster:
      "https://cdn.dragonballfr.com/media/episodes/879/hero/ec72611b7375d0b60dc6dbb4e52ff9332ddc151636d60d89a08fb1cd4107d95a/frame-600.webp",
  },
  {
    id: "ep-876",
    type: "episode",
    title: {
      fr: "Épisode 876 — Dragon Ball Z",
      en: "Episode 876 — Dragon Ball Z",
      ja: "第876話 — ドラゴンボールZ",
    },
    url: "https://cdn.dragonballfr.com/media/episodes/876/15415c1073ea1809729659d109842fc4a4d34e977e2b50a62735684e33957aa1/source.mp4",
    poster:
      "https://cdn.dragonballfr.com/media/episodes/876/hero/15415c1073ea1809729659d109842fc4a4d34e977e2b50a62735684e33957aa1/frame-1115.webp",
  },
  {
    id: "movie-12",
    type: "movie",
    title: {
      fr: "Film 12 — Fusions (Gogeta)",
      en: "Movie 12 — Fusion Reborn",
      ja: "劇場版第12作 — 復活のフュージョン!!悟空とベジータ",
    },
    url: "https://cdn.dragonballfr.com/media/movies/12/source.mp4",
    poster: "https://cdn.dragonballfr.com/assets/ext/db_movies/12.webp",
  },
  {
    id: "manga-dbfc-ch1",
    type: "manga",
    title: {
      fr: "Dragon Ball Full Color — Chapitre 1 : Bulma et Son Goku",
      en: "Dragon Ball Full Color — Chapter 1: Bulma and Son Goku",
      ja: "ドラゴンボール フルカラー — 其之一 ブルマと孫悟空",
    },
    poster: "https://cdn.dragonballfr.com/assets/manga/DBFC/ch1/001.jpg",
    totalPages: 33,
    pages: Array.from({ length: 33 }, (_, i) => {
      const pad = String(i + 1).padStart(3, "0");
      return `https://cdn.dragonballfr.com/assets/manga/DBFC/ch1/${pad}.jpg`;
    }),
  },
  {
    id: "manga-dbfc-ch516",
    type: "manga",
    title: {
      fr: "Dragon Ball Full Color — Chapitre 516 : Le Genkidama de la Terre",
      en: "Dragon Ball Full Color — Chapter 516: Earth's Spirit Bomb",
      ja: "ドラゴンボール フルカラー — 其之五百十六 超元気玉",
    },
    poster: "https://cdn.dragonballfr.com/assets/manga/DBFC/ch516/001.jpg",
    totalPages: 16,
    pages: Array.from({ length: 16 }, (_, i) => {
      const pad = String(i + 1).padStart(3, "0");
      return `https://cdn.dragonballfr.com/assets/manga/DBFC/ch516/${pad}.jpg`;
    }),
  },
  {
    id: "databook-daizenshuu-7",
    type: "databook",
    title: {
      fr: "Daizenshuu 7 — Le Grand Dictionnaire (Daijiten)",
      en: "Daizenshuu 7 — Dragon Ball Encyclopedia",
      ja: "大全新書7 — 大全集7 (大事典)",
    },
    poster: "https://cdn.dragonballfr.com/assets/ext/db_manga_volumes/82.jpg",
    totalPages: 10,
    pages: Array.from({ length: 10 }, (_, i) => {
      const pad = String(i + 1).padStart(3, "0");
      return `https://cdn.dragonballfr.com/assets/manga/DBFC/ch1/${pad}.jpg`;
    }),
  },
] as const;

export interface WatchState {
  readonly mediaId: string;
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly pageIndex: number;
  readonly updatedAt: number;
  readonly updatedBy: string;
}

export const WATCH_STORAGE_KEY_PREFIX = "shenron_watch_state:";
