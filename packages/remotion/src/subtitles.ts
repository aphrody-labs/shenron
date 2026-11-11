// SPDX-License-Identifier: Apache-2.0
/**
 * packages/remotion/src/subtitles.ts
 *
 * WebVTT subtitle synchronization for bilingual French and Japanese (Jimaku/Furigana) tracks.
 */

export interface SubtitleCue {
  startFrame: number;
  endFrame: number;
  text: string;
  lang?: string;
  furigana?: string;
}

export function findActiveSubtitle(
  subtitles: SubtitleCue[] | undefined,
  currentFrame: number,
): SubtitleCue | null {
  if (!subtitles) return null;
  return (
    subtitles.find((sub) => currentFrame >= sub.startFrame && currentFrame <= sub.endFrame) ?? null
  );
}
