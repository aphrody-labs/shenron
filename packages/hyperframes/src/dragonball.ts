// SPDX-License-Identifier: Apache-2.0
/**
 * packages/hyperframes/src/dragonball.ts
 *
 * Dedicated Dragon Ball R2 / CDN Streaming Asset Pipeline.
 * Manages 41 scene timecodes, 3 hero timecodes, and content-addressed retrieval.
 */

export const DRAGON_BALL_HERO_TIMECODES = [240, 600, 1115] as const;

export function computeSceneTimecodes(
  durationSec: number,
  count: number = 41,
  startOffsetSec: number = 48.5,
  endMarginSec: number = 32.5,
): number[] {
  const safeDuration = Math.max(durationSec - endMarginSec, startOffsetSec + 10);
  const usableSpan = safeDuration - startOffsetSec;
  const step = usableSpan / (count - 1);

  const timecodes: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.round((startOffsetSec + i * step) * 1000) / 1000;
    timecodes.push(t);
  }

  return timecodes;
}

export function buildCdnAssetUrls(
  episodeId: number,
  cdnBase: string = "https://cdn.dragonballfr.com",
) {
  return {
    sourceMp4: `${cdnBase}/media/episodes/${episodeId}/source.mp4`,
    hero240: `${cdnBase}/media/episodes/${episodeId}/hero-240.webp`,
    hero600: `${cdnBase}/media/episodes/${episodeId}/hero-600.webp`,
    hero1115: `${cdnBase}/media/episodes/${episodeId}/hero-1115.webp`,
    subtitlesFr: `/api/subtitles?episode=${episodeId}&lang=fr`,
    subtitlesJa: `/api/subtitles?episode=${episodeId}&lang=ja`,
  };
}
