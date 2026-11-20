// SPDX-License-Identifier: Apache-2.0
/**
 * @aphrody/shenron-engine/games/canon-scenario
 *
 * Sovereign Dragon Ball Canon Story & Scenario Resolver.
 *
 * Integrates:
 * 1. Akira Toriyama's 42 canonical manga tomes with page-level reader deep links.
 * 2. Anime video cutscene references with direct HLS episode player streaming.
 * 3. Daizenshuu 7 & Chouzenshuu 4 canonical battle statistics & power levels.
 * 4. Bilingual dialogue system (Japanese original + French canonical translation).
 * 5. Dramatic finish triggers and beam clash configurations.
 */

import manifestData from "../../../../data/games/canon-story-manifest.json";

export interface CanonSaga {
  id: string;
  name: string;
  name_ja: string;
  tomes: number[];
  era: string;
}

export interface CanonFighter {
  id: string;
  name: string;
  name_ja: string;
  power_level: number;
  style: "balanced" | "rush" | "power" | "trickster" | "brute" | "team" | "boss";
  boss_hp?: number;
  wiki_slug: string;
}

export interface CanonRefs {
  manga_url: string;
  episode_id: number;
  episode_url: string;
  wiki_arc_url: string;
  technique_slug: string;
  daizenshuu: string;
  databook_lot: string;
}

export interface CanonDialogue {
  speaker: string;
  speaker_ja: string;
  text: string;
  text_ja: string;
}

export interface CanonDramaticFinish {
  move: string;
  anim_cutscene: string;
}

export interface CanonChapter {
  id: number;
  saga_id: string;
  tome: number;
  manga_chapter: number;
  page_start: number;
  title: string;
  title_ja: string;
  arena_id: string;
  arena_name: string;
  player: CanonFighter;
  enemy: CanonFighter;
  canon_refs: CanonRefs;
  dialogue_intro: CanonDialogue[];
  dialogue_victory: CanonDialogue[];
  objective: string;
  dramatic_finish: CanonDramaticFinish;
}

export interface CanonStoryManifest {
  version: string;
  generated_at: string;
  source_author: string;
  curation: string;
  sagas: CanonSaga[];
  chapters: CanonChapter[];
}

const typedManifest = manifestData as unknown as CanonStoryManifest;

/**
 * Get the master canon story manifest.
 */
export function getCanonStoryManifest(): CanonStoryManifest {
  return typedManifest;
}

/**
 * Retrieve all canonical sagas with their matching chapters.
 */
export function getCanonSagasWithChapters(): Array<CanonSaga & { chapters: CanonChapter[] }> {
  return typedManifest.sagas.map((saga) => ({
    ...saga,
    chapters: typedManifest.chapters.filter((ch) => ch.saga_id === saga.id),
  }));
}

/**
 * Retrieve a specific canonical chapter by its sequence ID.
 */
export function getCanonChapter(id: number): CanonChapter | undefined {
  return typedManifest.chapters.find((ch) => ch.id === id);
}

/**
 * Calculate power level handicap or damage modifier based on Daizenshuu 7 stats.
 * Uses logarithmic scaling so astronomical numbers (e.g. 150,000,000) remain playable.
 */
export function computeCanonPowerMultiplier(
  playerPower: number,
  enemyPower: number,
): {
  playerDamageMultiplier: number;
  enemyDamageMultiplier: number;
  scouterRatio: number;
} {
  const logPlayer = Math.log10(Math.max(1, playerPower));
  const logEnemy = Math.log10(Math.max(1, enemyPower));
  const diff = logPlayer - logEnemy;

  // Clamped between 0.65x and 1.45x for gameplay balance
  const playerMultiplier = Math.max(0.65, Math.min(1.45, 1.0 + diff * 0.15));
  const enemyMultiplier = Math.max(0.65, Math.min(1.45, 1.0 - diff * 0.15));

  return {
    playerDamageMultiplier: Number(playerMultiplier.toFixed(2)),
    enemyDamageMultiplier: Number(enemyMultiplier.toFixed(2)),
    scouterRatio: Number((playerPower / Math.max(1, enemyPower)).toFixed(2)),
  };
}

/**
 * Generate formatted Manga speech balloons with Japanese and French text.
 */
export function formatMangaDialogues(
  dialogues: CanonDialogue[],
  mode: "fr" | "ja" | "bilingual" = "bilingual",
): Array<{
  speaker: string;
  content: string;
  subContent?: string;
}> {
  return dialogues.map((d) => {
    if (mode === "ja") {
      return { speaker: d.speaker_ja, content: d.text_ja };
    }
    if (mode === "fr") {
      return { speaker: d.speaker, content: d.text };
    }
    return {
      speaker: `${d.speaker} (${d.speaker_ja})`,
      content: d.text,
      subContent: d.text_ja,
    };
  });
}
