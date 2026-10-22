// SPDX-License-Identifier: Apache-2.0
import { LEVEL_THRESHOLDS } from "./constants";
import {
  calculateLevelForXP,
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

/**
 * Niveau atteint pour un XP.
 */
export function levelForXP(xp: number): number {
  return calculateLevelForXP(xp, ACTIVE_THRESHOLDS);
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
  const level = levelForXP(safe);
  const required = level > 0 ? xpRequiredForLevel(level) : 0;
  const floor = Number.isFinite(required) ? required : 0;
  const next = nextThresholdFrom(safe);
  const span = next ? Math.max(0, next.xp - floor) : 0;
  const into = Math.max(0, safe - floor);
  const ratio = next ? (span > 0 ? Math.min(1, into / span) : 0) : 1;
  return { level, floor, next, into, span, ratio, remaining: next ? next.xp - safe : 0 };
}
