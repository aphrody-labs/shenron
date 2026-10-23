/**
 * Assembles the frame catalog from analysed frames. Pure and deterministic: the result does
 * not depend on the order the analyses arrived in (workers finish in any order), only on
 * their content, so a build on 24 cores equals a build on one.
 */
import type { CatalogFrame, CropTuple, FrameCatalog } from "./catalog";
import type { Crop, FrameAnalysis } from "./analyze";
import {
  TRANSFORMATION_AURA,
  TRANSFORMATION_KEYS,
  auraShare,
  transformationsOfTitles,
  type TransformationKey,
} from "./transformations";

export interface EpisodeInfo {
  id: number;
  series: string;
  number: number;
  titleJa: string | null;
  titleFr: string | null;
  durationSec: number | null;
  /** Slug of the arc, when the episode belongs to one. */
  arc: string | null;
  /** Slug of the saga of the arc. */
  saga: string | null;
}

export interface AnalysedFrame {
  episode: EpisodeInfo;
  /** Path under the catalog base (`DB/ep001/frame-00001.webp`). */
  path: string;
  timecodeSec: number;
  analysis: FrameAnalysis;
}

export interface CatalogOptions {
  base: string;
  /** Frames kept per series, saga, arc and transformation. */
  perSeries?: number;
  perSaga?: number;
  perArc?: number;
  perTransformation?: number;
  /** At most this many frames of one episode in one list. */
  perEpisode?: number;
  /** Lowest score of a frame offered as a backdrop. */
  minScore?: number;
  totals: { episodes: number; frames: number; failed: number };
}

export const DEFAULT_LISTS = {
  perSeries: 24,
  perSaga: 8,
  perArc: 6,
  perTransformation: 8,
  perEpisode: 2,
  minScore: 0.5,
} as const;

const tuple = (crop: Crop): CropTuple => [crop.x, crop.y, crop.w, crop.h, crop.held];

function toEntry(frame: AnalysedFrame): CatalogFrame {
  const { analysis } = frame;
  return {
    p: frame.path,
    e: frame.episode.id,
    s: frame.episode.series,
    n: frame.episode.number,
    t: frame.timecodeSec,
    q: analysis.score,
    d: analysis.dominant,
    h: analysis.hue,
    l: analysis.luma,
    k: analysis.contrast,
    sh: analysis.sharpness,
    sa: analysis.saturation,
    f: analysis.focus,
    c2: tuple(analysis.crop21),
    c1: tuple(analysis.crop11),
  };
}

/** Best first (score, then path), at most `perEpisode` frames of one episode. */
function top(
  candidates: readonly AnalysedFrame[],
  count: number,
  perEpisode: number,
  weight: (frame: AnalysedFrame) => number = (frame) => frame.analysis.score,
): AnalysedFrame[] {
  const ranked = candidates.toSorted(
    (a, b) => weight(b) - weight(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  const taken = new Map<number, number>();
  const out: AnalysedFrame[] = [];
  for (const frame of ranked) {
    if (out.length >= count) break;
    const used = taken.get(frame.episode.id) ?? 0;
    if (used >= perEpisode) continue;
    taken.set(frame.episode.id, used + 1);
    out.push(frame);
  }
  return out;
}

/**
 * Rank of a frame among those of the episodes that show a transformation: its quality, raised
 * when a good part of the frame is in the colour of the transformation (golden hair, red aura).
 */
function transformationWeight(key: TransformationKey, frame: AnalysedFrame): number {
  if (!TRANSFORMATION_AURA[key]) return frame.analysis.score;
  const affinity = Math.min(1, auraShare(key, frame.analysis.hueShares) / 0.12);
  return frame.analysis.score * (0.4 + 0.6 * affinity);
}

/** Flag counts over every analysed frame. */
function countFlags(frames: readonly AnalysedFrame[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const frame of frames) {
    for (const flag of frame.analysis.flags) counts[flag] = (counts[flag] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).toSorted(([a], [b]) => (a < b ? -1 : 1)));
}

export function buildCatalog(
  analysed: readonly AnalysedFrame[],
  options: CatalogOptions,
): FrameCatalog {
  const config = { ...DEFAULT_LISTS, ...options };
  const frames = analysed.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const usable = frames.filter(
    (frame) => frame.analysis.flags.length === 0 && frame.analysis.score >= config.minScore,
  );

  const groups = (key: (frame: AnalysedFrame) => string | null) => {
    const map = new Map<string, AnalysedFrame[]>();
    for (const frame of usable) {
      const name = key(frame);
      if (name === null) continue;
      const list = map.get(name);
      if (list) list.push(frame);
      else map.set(name, [frame]);
    }
    return [...map].toSorted(([a], [b]) => (a < b ? -1 : 1));
  };

  const lists = {
    series: groups((frame) => frame.episode.series).map(
      ([name, list]) => [name, top(list, config.perSeries, config.perEpisode)] as const,
    ),
    sagas: groups((frame) => frame.episode.saga).map(
      ([name, list]) => [name, top(list, config.perSaga, config.perEpisode)] as const,
    ),
    arcs: groups((frame) => frame.episode.arc).map(
      ([name, list]) => [name, top(list, config.perArc, config.perEpisode)] as const,
    ),
    transformations: TRANSFORMATION_KEYS.map((key) => {
      const linked = usable.filter((frame) =>
        transformationsOfTitles({
          ja: frame.episode.titleJa,
          fr: frame.episode.titleFr,
        }).includes(key),
      );
      return [
        key,
        top(linked, config.perTransformation, config.perEpisode, (frame) =>
          transformationWeight(key, frame),
        ),
      ] as const;
    }).filter(([, list]) => list.length > 0),
  };

  // one table of entries, sorted by path; the lists point into it
  const chosen = new Map<string, AnalysedFrame>();
  for (const group of Object.values(lists)) {
    for (const [, list] of group) for (const frame of list) chosen.set(frame.path, frame);
  }
  const ordered = [...chosen.values()].toSorted((a, b) => (a.path < b.path ? -1 : 1));
  const indexOf = new Map(ordered.map((frame, index) => [frame.path, index]));
  const indexes = (list: readonly AnalysedFrame[]) => list.map((frame) => indexOf.get(frame.path)!);
  const toRecord = (group: ReadonlyArray<readonly [string, readonly AnalysedFrame[]]>) =>
    Object.fromEntries(group.map(([name, list]) => [name, indexes(list)]));

  return {
    version: 1,
    base: config.base,
    totals: {
      episodes: config.totals.episodes,
      frames: config.totals.frames,
      analysed: frames.length,
      failed: config.totals.failed,
      usable: usable.length,
      flags: countFlags(frames),
    },
    frames: ordered.map(toEntry),
    series: toRecord(lists.series),
    sagas: toRecord(lists.sagas),
    arcs: toRecord(lists.arcs),
    transformations: toRecord(lists.transformations),
  };
}
