// SPDX-License-Identifier: Apache-2.0
/**
 * Accent colours of Container cards. One accent per domain keeps a member oriented at a glance
 * (levels are blue like the ki, the economy gold like zeni, lore green like Shenron…), and the
 * outcome accents (`success`, `error`, `info`) follow the site palette (`docs/products/
 * bot-discord-refonte.md` §4.1). A personal card (race, tier) passes its own colour as a number.
 */
export const ACCENT_COLORS = {
  /** Shenron brand: `--dbz-orange`. */
  brand: 0xe78220,
  /** Levels and progression: `--dbz-ki`. */
  level: 0x4ba8ff,
  /** Economy, shop, zeni: gold. */
  economy: 0xffb200,
  /** Lore: wiki, canon, databooks, episodes, manga: Namek green, `--dbz-green`. */
  lore: 0x2e9b41,
  /** Games: Beerus purple. */
  games: 0x8b5cf6,
  /** Staff, moderation and administration: slate. */
  staff: 0x64748b,
  success: 0x2e9b41,
  error: 0xf10c3b,
  info: 0x4ba8ff,
} as const;

export type Accent = keyof typeof ACCENT_COLORS;

/** An accent name, or an explicit RGB colour (`0x000000`–`0xffffff`). */
export type AccentInput = Accent | number;

/** RGB colour of an accent; a number must be an integer in `0x000000`–`0xffffff`. */
export function resolveAccent(accent: AccentInput | undefined): number {
  if (accent === undefined) return ACCENT_COLORS.brand;
  if (typeof accent === "number") {
    if (!Number.isInteger(accent) || accent < 0 || accent > 0xffffff) {
      throw new RangeError(`accent colour out of range: ${accent}`);
    }
    return accent;
  }
  return ACCENT_COLORS[accent];
}
