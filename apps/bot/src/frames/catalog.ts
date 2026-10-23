/**
 * Catalog of qualified episode frames, and the choice of a card backdrop in it.
 *
 * `assets/render/frame-catalog.json` is produced by `scripts/build-frame-catalog.ts` (every
 * frame analysed on all cores): the best frames of each series, saga and arc, and the frames
 * of the episodes whose title names a transformation. Choosing a backdrop is a pure,
 * deterministic function of the request (member, day, race, tier), so the same member sees the
 * same frame on the same day on every machine and in every render worker.
 *
 * The pictures themselves are not in the repository: they are read from the CDN
 * (`base` + `p`) through the cached frame loader of `~/lib/canvas-kit`.
 */
import raw from "../../assets/render/frame-catalog.json" with { type: "json" };
import type { FrameBackdrop } from "./types";
import {
  TRANSFORMATION_SERIES,
  transformationKeyForLabel,
  type TransformationKey,
} from "./transformations";

/** `[x, y, width, height, held]`: a window as fractions of the frame, and the saliency it holds. */
export type CropTuple = [number, number, number, number, number];

export interface CatalogFrame {
  /** Path under `base` (`DB/ep001/frame-00001.webp`). */
  p: string;
  /** Episode id (`db_episodes.id`). */
  e: number;
  /** Series (`DB`, `DBZ`, ...). */
  s: string;
  /** Episode number in the series. */
  n: number;
  /** Timecode in the episode, seconds. */
  t: number;
  /** Quality as a backdrop, 0 to 1. */
  q: number;
  /** Dominant colour `#rrggbb`. */
  d: string;
  /** Dominant hue in degrees, -1 when achromatic. */
  h: number;
  /** Mean luma, 0 to 1. */
  l: number;
  /** Contrast, 0 to 1. */
  k: number;
  /** Sharpness (variance of the Laplacian). */
  sh: number;
  /** Saturation, 0 to 1. */
  sa: number;
  /** Centre of interest, fractions of the frame. */
  f: [number, number];
  /** Best 2:1 window. */
  c2: CropTuple;
  /** Best 1:1 window. */
  c1: CropTuple;
}

export interface FrameCatalog {
  version: 1;
  /** URL prefix of every `p`. */
  base: string;
  totals: {
    episodes: number;
    frames: number;
    analysed: number;
    failed: number;
    usable: number;
    flags: Record<string, number>;
  };
  frames: CatalogFrame[];
  /** Indexes into `frames`, best first, by series. */
  series: Record<string, number[]>;
  sagas: Record<string, number[]>;
  arcs: Record<string, number[]>;
  /** Frames of the episodes whose title names the transformation. */
  transformations: Partial<Record<TransformationKey, number[]>>;
}

export const defaultCatalog = raw as unknown as FrameCatalog;

export type { FrameBackdrop } from "./types";

export type FramePurpose = "profile" | "tier" | "leaderboard";

export interface FrameRequest {
  purpose: FramePurpose;
  /** Member id (or any stable text): the same seed always gets the same frame. */
  seed: string;
  /** Day key (`YYYY-MM-DD`, UTC by default), for the rotating choices. */
  day?: string;
  race?: string | null;
  /** Transformation of the tier, when the caller knows its key. */
  transformation?: TransformationKey | null;
  /** Tier label, from which the transformation is read when `transformation` is absent. */
  label?: string | null;
}

/**
 * Sagas whose episodes carry each race, used for a profile without a tier link. Canon facts of
 * the story: the Saiyan saga for Saiyans, Namek for Nameks (and Frieza's mutants), the
 * tournaments and the Red Ribbon for humans, the Androids and Cell for cyborgs, Buu for Majins.
 */
export const RACE_SAGAS: Record<string, readonly string[]> = {
  saiyan: ["saiyan"],
  humain: ["tournament-21", "tournament-22b", "tournament-23", "red-ribbon"],
  namek: ["namek"],
  mutant: ["namek"],
  cyborg: ["cell", "androids"],
  majin: ["buu"],
};

/** FNV-1a hash of a text. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Day key of an instant, UTC. */
export function dayKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

function backdropOf(catalog: FrameCatalog, index: number): FrameBackdrop | null {
  const frame = catalog.frames[index];
  if (!frame) return null;
  return {
    url: `${catalog.base}${frame.p}`,
    id: frame.p,
    series: frame.s,
    episode: frame.e,
    focus: frame.f,
    dominant: frame.d,
  };
}

/** Every series list, best frames first, merged without duplicates in catalog order. */
function globalPool(catalog: FrameCatalog): number[] {
  const seen = new Set<number>();
  const pool: number[] = [];
  for (const series of Object.keys(catalog.series).toSorted()) {
    for (const index of catalog.series[series]!) {
      if (!seen.has(index)) {
        seen.add(index);
        pool.push(index);
      }
    }
  }
  return pool;
}

const pick = (pool: readonly number[], seed: string): number | null =>
  pool.length === 0 ? null : pool[hashText(seed) % pool.length]!;

function union(lists: ReadonlyArray<readonly number[] | undefined>): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const list of lists) {
    for (const index of list ?? []) {
      if (!seen.has(index)) {
        seen.add(index);
        out.push(index);
      }
    }
  }
  return out;
}

/**
 * Backdrop for a card, or `null` when the catalog has nothing for the request (the card then
 * draws its own background).
 *
 *   tier         the frame of an episode that shows the transformation, else a frame of the
 *                series where it appears; one frame per member
 *   profile      the same link by tier, else the saga of the member's race; one frame per
 *                member; without either, a frame that rotates every day
 *   leaderboard  the frame of the day, the same for the whole server
 */
export function pickFrameBackdrop(
  request: FrameRequest,
  catalog: FrameCatalog = defaultCatalog,
): FrameBackdrop | null {
  const day = request.day ?? dayKey();
  const key = request.transformation ?? transformationKeyForLabel(request.label);
  let index: number | null = null;

  if (request.purpose === "leaderboard") {
    index = pick(globalPool(catalog), `leaderboard|${day}|${request.seed}`);
  } else {
    if (key) {
      const linked = catalog.transformations[key] ?? [];
      index = pick(linked, `${request.purpose}|${key}|${request.seed}`);
      if (index === null) {
        const pool = union(TRANSFORMATION_SERIES[key].map((series) => catalog.series[series]));
        index = pick(pool, `${request.purpose}|series|${key}|${request.seed}`);
      }
    }
    if (index === null && request.purpose === "profile" && request.race) {
      const sagas = RACE_SAGAS[request.race] ?? [];
      const pool = union(sagas.map((saga) => catalog.sagas[saga]));
      index = pick(pool, `profile|race|${request.race}|${request.seed}`);
    }
    if (index === null) {
      index = pick(globalPool(catalog), `${request.purpose}|day|${day}|${request.seed}`);
    }
  }
  return index === null ? null : backdropOf(catalog, index);
}
