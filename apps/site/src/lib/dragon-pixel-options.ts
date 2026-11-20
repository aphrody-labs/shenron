// SPDX-License-Identifier: Apache-2.0
/** Choices and HUD shapes shared by the Bevy view and the canvas view of Dragon Pixel. */

export const FIGHTER_IDS = [
  "goku",
  "vegeta",
  "gohan",
  "piccolo",
  "trunks",
  "frieza",
  "cell",
  "buu",
  "yamcha",
  "krilin",
  "jackie_chun",
  "beerus",
] as const;

export const ARENA_IDS = [
  "paozu",
  "budokai",
  "wasteland",
  "namek",
  "cell_games",
  "kaiohshin",
  "kaio_planet",
] as const;

/** Only the story mode changes the match: the other engine modes share the free-fight rules. */
export const MODE_IDS = ["arcade", "story"] as const;

/** Chapters of the story mode of crates/dragon-pixel (`get_story_chapters`). */
export const STORY_CHAPTER_COUNT = 18;

/** One entry of `story_chapters_json` (crates/dragon-pixel/src/wasm.rs): the roster is the only chapter list. */
export interface StoryChapterSummary {
  id: number;
  saga: string;
  title: string;
  title_ja: string;
  episode_id: number | null;
  manga_volume_id: number | null;
}

/** Parses `story_chapters_json`; an unreadable payload gives no chapter titles, never a crash. */
export function parseStoryChapters(json: string): StoryChapterSummary[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter(
          (entry): entry is StoryChapterSummary =>
            typeof entry?.id === "number" && typeof entry?.title === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export type FighterId = (typeof FIGHTER_IDS)[number];
export type ArenaId = (typeof ARENA_IDS)[number];
export type ModeId = (typeof MODE_IDS)[number];

export interface ArenaSelection {
  fighter: FighterId;
  mode: ModeId;
  chapter: number;
  arena: ArenaId;
}

export const DEFAULT_SELECTION: ArenaSelection = {
  fighter: "goku",
  mode: "arcade",
  chapter: 1,
  arena: "budokai",
};

/** Mirror of `UiOverlayData` in crates/dragon-pixel/src/render_packet.rs. */
export interface HudUi {
  player_hp_ratio: number;
  player_ki_ratio: number;
  enemy_hp_ratio: number;
  enemy_ki_ratio: number;
  player_name: string;
  enemy_name: string;
  player_combo: number;
  player_score: number;
  time_elapsed: number;
  player_power_level: number;
  enemy_power_level: number;
  clash_active: boolean;
  clash_tension: number;
  chapter_title: string;
}

export type MatchStatus = "playing" | "won" | "lost";

export interface ArenaHud {
  status: MatchStatus;
  paused: boolean;
  ui: HudUi;
}

/** The HUD the Bevy app publishes (`dragon_pixel_hud_json`); null before its first frame. */
export function parseBevyHud(json: string): (ArenaHud & { frames: number }) | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ArenaHud & { frames: number };
    return typeof parsed.frames === "number" && parsed.ui ? parsed : null;
  } catch {
    return null;
  }
}
