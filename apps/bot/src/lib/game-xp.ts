// SPDX-License-Identifier: Apache-2.0
/**
 * XP of the mini-games: pure rules, no database and no Discord.
 *
 * A game result is worth a share of the distance between the member's reached tier and the
 * next one (`xpProgress().span`), so a result weighs the same at every level of the curve and
 * a game can never skip a tier on its own. The award is never multiplied: the role, race, night
 * and Zenkai multipliers belong to messages and voice (2026-10-22 inflation, see
 * `docs/operations/bot-economie-incidents.md`), and the sum of the game XP over a rolling 24 h
 * is capped at a share of the current span.
 */
import { XP_MAX, getLevelThresholds, xpProgress } from "~/lib/xp";

/** `podium` is the top three of a ranked game (the Arena); `play` is mere participation. */
export type GameXpOutcome = "win" | "draw" | "podium" | "play";

export interface GameXpConfig {
  enabled: boolean;
  /** Share of the span for a win. */
  winRatio: number;
  /** Share of the span for a draw or a podium finish. */
  drawRatio: number;
  /** Share of the span for taking part (loss, or a win that is not paid). */
  playRatio: number;
  /** Floor of one award, whatever the span. */
  min: number;
  /** Rolling 24 h cap of all game XP, as a share of the current span. */
  dailyRatio: number;
}

export const GAME_XP_DEFAULTS: Readonly<GameXpConfig> = {
  enabled: true,
  winRatio: 0.02,
  drawRatio: 0.01,
  playRatio: 0.004,
  min: 25,
  dailyRatio: 0.1,
};

/** Settings (`guild_settings`) read by {@link loadGameXpConfig}. */
export const GAME_XP_KEYS = {
  enabled: "games.xp.enabled",
  winRatio: "games.xp.win_ratio",
  drawRatio: "games.xp.draw_ratio",
  playRatio: "games.xp.play_ratio",
  min: "games.xp.min",
  dailyRatio: "games.xp.daily_ratio",
} as const;

/** Window of the daily cap. */
export const GAME_XP_WINDOW_MS = 86_400_000;

/** What a game result actually gave, for the result message. */
export interface GameXpGrant {
  /** XP credited (0 when disabled, capped, or the account is frozen). */
  xp: number;
  /** The award was reduced or refused by the daily cap or a single-gain ceiling. */
  capped: boolean;
  levelUp: boolean;
  oldLevel: number;
  newLevel: number;
}

/** The part of `SettingsService` the loader needs (also satisfied by a test double). */
export interface GameXpSettings {
  getBool(key: string, fallback: boolean): Promise<boolean>;
  getInt(key: string, fallback: number): Promise<number>;
  getFloat(key: string, fallback: number): Promise<number>;
}

function ratio(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Reads the six `games.xp.*` settings, each falling back to its default when absent or invalid. */
export async function loadGameXpConfig(settings: GameXpSettings): Promise<GameXpConfig> {
  const d = GAME_XP_DEFAULTS;
  const [enabled, winRatio, drawRatio, playRatio, min, dailyRatio] = await Promise.all([
    settings.getBool(GAME_XP_KEYS.enabled, d.enabled),
    settings.getFloat(GAME_XP_KEYS.winRatio, d.winRatio),
    settings.getFloat(GAME_XP_KEYS.drawRatio, d.drawRatio),
    settings.getFloat(GAME_XP_KEYS.playRatio, d.playRatio),
    settings.getInt(GAME_XP_KEYS.min, d.min),
    settings.getFloat(GAME_XP_KEYS.dailyRatio, d.dailyRatio),
  ]);
  return {
    enabled,
    winRatio: ratio(winRatio, d.winRatio),
    drawRatio: ratio(drawRatio, d.drawRatio),
    playRatio: ratio(playRatio, d.playRatio),
    min: Math.max(0, Number.isFinite(min) ? Math.trunc(min) : d.min),
    dailyRatio: ratio(dailyRatio, d.dailyRatio),
  };
}

/**
 * Distance between the reached tier and the next one on the ACTIVE curve. At the maximum level
 * there is no next tier: the gap of the last tier stands in for it. 0 for an empty curve.
 */
export function gameXpSpan(xp: number): number {
  const progress = xpProgress(xp);
  if (progress.next) return progress.span;
  const curve = getLevelThresholds().toSorted((a, b) => a.xp - b.xp);
  const last = curve.at(-1);
  if (!last) return 0;
  const below = curve.findLast((t) => t.xp < last.xp);
  return Math.max(0, last.xp - (below?.xp ?? 0));
}

function ratioOf(outcome: GameXpOutcome, cfg: GameXpConfig): number {
  switch (outcome) {
    case "win":
      return cfg.winRatio;
    case "draw":
    case "podium":
      return cfg.drawRatio;
    case "play":
      return cfg.playRatio;
  }
}

/**
 * XP of one result for a member holding `xp`: `max(min, round(span x ratio))`, never multiplied
 * by anything. 0 when the feature is disabled.
 */
export function gameXpAward(
  xp: number,
  outcome: GameXpOutcome,
  cfg: GameXpConfig = GAME_XP_DEFAULTS,
): number {
  if (!cfg.enabled) return 0;
  const award = Math.max(cfg.min, Math.round(gameXpSpan(xp) * ratioOf(outcome, cfg)));
  return Number.isFinite(award) ? Math.min(XP_MAX, Math.max(0, award)) : 0;
}

/** Most game XP a member can receive over a rolling 24 h: `dailyRatio` of the current span. */
export function gameXpDailyCap(xp: number, cfg: GameXpConfig = GAME_XP_DEFAULTS): number {
  if (!cfg.enabled) return 0;
  return Math.min(XP_MAX, Math.max(0, Math.floor(gameXpSpan(xp) * cfg.dailyRatio)));
}

/**
 * Applies the daily cap to an award: what is left of the cap after `usedLastDay` (the game XP
 * already received over the last 24 h). `capped` tells that the award was reduced, down to 0.
 */
export function gameXpWithinCap(
  award: number,
  usedLastDay: number,
  xp: number,
  cfg: GameXpConfig = GAME_XP_DEFAULTS,
): { xp: number; capped: boolean } {
  const room = Math.max(0, gameXpDailyCap(xp, cfg) - Math.max(0, usedLastDay));
  const granted = Math.max(0, Math.min(award, room));
  return { xp: granted, capped: granted < award };
}
