// SPDX-License-Identifier: Apache-2.0
import { LEVEL_THRESHOLDS } from "./constants";
import {
  calculateNextThresholdFrom,
  calculateXpRequiredForLevel,
  formatXP as formatXpHelper,
  type LevelThreshold,
} from "@aphrody/shenron-config/xp";

export type { LevelThreshold };

/**
 * Paliers ACTIFS. Défaut = `LEVEL_THRESHOLDS` (en dur), mais éditables depuis
 * l'admin : `loadLevelThresholds(db)` (au boot) et l'API remplacent ce tableau
 * par ceux stockés en DB (`guild_settings` clé `xp.thresholds`). Toujours trié
 * par xp croissant (invariant de `levelForXP`/`nextThresholdFrom`).
 */
let ACTIVE_THRESHOLDS: readonly LevelThreshold[] = LEVEL_THRESHOLDS;

/** Remplace la courbe de niveaux active (validée + triée par xp croissant). */
export function setLevelThresholds(rows: LevelThreshold[]): void {
  const clean = rows
    .filter((r) => Number.isFinite(r.level) && Number.isFinite(r.xp) && r.xp >= 0)
    .toSorted((a, b) => a.xp - b.xp);
  ACTIVE_THRESHOLDS = clean.length ? clean : LEVEL_THRESHOLDS;
}

/** Courbe de niveaux active (source unique de vérité runtime). */
export function getLevelThresholds(): readonly LevelThreshold[] {
  return ACTIVE_THRESHOLDS;
}

/** Cap on a stored XP value: beyond it a JavaScript integer is no longer exact. */
export const XP_MAX = Number.MAX_SAFE_INTEGER;

/** Clamps an XP amount to a safe integer in [0, XP_MAX] (NaN and negatives become 0). */
export function sanitizeXp(xp: number): number {
  if (!Number.isFinite(xp)) return xp === Infinity ? XP_MAX : 0;
  return Math.min(XP_MAX, Math.max(0, Math.trunc(xp)));
}

/**
 * Reached and next threshold for an XP value. Tolerates an unsorted curve, non-finite or
 * negative XP, and level labels that do not grow with XP: only the order of the XP
 * thresholds matters.
 */
function locate(
  xp: number,
  thresholds: readonly LevelThreshold[],
): { reached: LevelThreshold | undefined; next: LevelThreshold | undefined } {
  const safe = Number.isFinite(xp) ? xp : 0;
  let reached: LevelThreshold | undefined;
  let next: LevelThreshold | undefined;
  for (const t of thresholds) {
    if (t.xp <= safe) {
      if (!reached || t.xp > reached.xp || (t.xp === reached.xp && t.level > reached.level)) {
        reached = t;
      }
    } else if (!next || t.xp < next.xp || (t.xp === next.xp && t.level < next.level)) {
      next = t;
    }
  }
  return { reached, next };
}

/**
 * Level of an XP value on a given curve (default: the active curve). PURE, and the only
 * definition of the level: the level always follows the XP, never the other way round.
 * Replay it to fix stored levels that have drifted.
 */
export function levelFromXp(
  xp: number,
  thresholds: readonly LevelThreshold[] = ACTIVE_THRESHOLDS,
): number {
  return locate(xp, thresholds).reached?.level ?? 0;
}

/**
 * Stored levels that no longer match their XP (edited curve, hand-corrected XP, restore).
 * Pure: touches nothing and returns what has to be rewritten.
 */
export function levelDrift(
  rows: Iterable<{ id: string; xp: number; lastLevelReached: number }>,
  thresholds: readonly LevelThreshold[] = ACTIVE_THRESHOLDS,
): Array<{ id: string; xp: number; stored: number; expected: number }> {
  const out: Array<{ id: string; xp: number; stored: number; expected: number }> = [];
  for (const row of rows) {
    const expected = levelFromXp(row.xp, thresholds);
    if (expected !== row.lastLevelReached) {
      out.push({ id: row.id, xp: row.xp, stored: row.lastLevelReached, expected });
    }
  }
  return out;
}

/**
 * Niveau atteint pour un XP.
 */
export function levelForXP(xp: number): number {
  return levelFromXp(xp, ACTIVE_THRESHOLDS);
}

export function xpRequiredForLevel(level: number): number {
  return calculateXpRequiredForLevel(level, ACTIVE_THRESHOLDS);
}

export function nextThresholdFrom(xp: number) {
  return calculateNextThresholdFrom(xp, ACTIVE_THRESHOLDS);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function formatXP(xp: number): string {
  return formatXpHelper(xp);
}

/** Progression dans le palier courant, source unique de /profil, de la carte et de l'API. */
export interface XpProgress {
  level: number;
  /** XP du palier atteint (0 avant le premier palier). */
  floor: number;
  /** Prochain palier, `undefined` au niveau maximal. */
  next: LevelThreshold | undefined;
  /** XP gagnée depuis le palier atteint. */
  into: number;
  /** Écart entre le palier atteint et le suivant. */
  span: number;
  /** Avancement 0..1 (1 au niveau maximal). */
  ratio: number;
  /** XP restante jusqu'au prochain palier (0 au niveau maximal). */
  remaining: number;
}

export function xpProgress(xp: number): XpProgress {
  const safe = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const { reached, next } = locate(safe, ACTIVE_THRESHOLDS);
  const floor = reached?.xp ?? 0;
  const span = next ? Math.max(0, next.xp - floor) : 0;
  const into = Math.max(0, safe - floor);
  const ratio = next ? (span > 0 ? Math.min(1, into / span) : 0) : 1;
  return {
    level: reached?.level ?? 0,
    floor,
    next,
    into,
    span,
    ratio,
    remaining: next ? next.xp - safe : 0,
  };
}

/**
 * XP buckets per REACHED level: level 0 before the first threshold, then one bucket per
 * threshold, the last one open-ended. Pure; the former distribution labelled each bucket
 * with the level it had NOT reached and hard-coded "level 11".
 */
export function buildXpBuckets(
  thresholds: readonly LevelThreshold[] = ACTIVE_THRESHOLDS,
): Array<{ level: number; minXp: number; maxXp: number }> {
  const curve = thresholds.toSorted((a, b) => a.xp - b.xp);
  const out = [{ level: 0, minXp: 0, maxXp: curve[0]?.xp ?? XP_MAX }];
  curve.forEach((t, i) => {
    out.push({ level: t.level, minXp: t.xp, maxXp: curve[i + 1]?.xp ?? XP_MAX });
  });
  return out;
}
