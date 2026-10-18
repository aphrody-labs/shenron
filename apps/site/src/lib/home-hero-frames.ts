// SPDX-License-Identifier: Apache-2.0
/** Public stills extracted from qualified CDN episode sources. */
export interface HomeHeroFrame {
  src: string;
  episodeId: number;
  timecodeSec: number;
  width: number;
  height: number;
}

export const HOME_HERO_FRAMES: readonly HomeHeroFrame[] = [
  {
    src: "https://cdn.dragonballfr.com/media/episodes/876/hero/15415c1073ea1809729659d109842fc4a4d34e977e2b50a62735684e33957aa1/frame-1115.webp",
    episodeId: 876,
    timecodeSec: 1115,
    width: 1440,
    height: 810,
  },
  {
    src: "https://cdn.dragonballfr.com/media/episodes/875/hero/84284388bf476254dd74ab2b9284476e6135d578d3d5b039dd38dff13e762ab3/frame-1100.webp",
    episodeId: 875,
    timecodeSec: 1100,
    width: 1440,
    height: 810,
  },
  {
    src: "https://cdn.dragonballfr.com/media/episodes/876/hero/5c591046a2e494cebc48f6704aef84d17fbd2900807ea7e8437c7d4057ad279f/frame-900.webp",
    episodeId: 876,
    timecodeSec: 900,
    width: 1440,
    height: 810,
  },
  {
    src: "https://cdn.dragonballfr.com/media/episodes/876/hero/e59bb6df4d152cb9b1c7b256fa40b683d85f537f8028dcf466fa325349dde7f9/frame-240.webp",
    episodeId: 876,
    timecodeSec: 240,
    width: 1440,
    height: 810,
  },
];
