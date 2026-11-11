// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  getCanonStoryManifest,
  getCanonChapter,
  computeCanonPowerMultiplier,
} from "@aphrody/shenron-engine";

describe("Canon Game Monorepo Integration", () => {
  it("verifies all 10 canonical story chapters have valid wiki, manga and anime links", () => {
    const manifest = getCanonStoryManifest();
    expect(manifest.chapters.length).toBe(10);

    for (const chapter of manifest.chapters) {
      expect(chapter.canon_refs.manga_url).toMatch(/^\/wiki\/manga\/volume\/\d+\?chapter=\d+/);
      expect(chapter.canon_refs.episode_url).toMatch(/^\/wiki\/episodes\/\d+/);
      expect(chapter.canon_refs.wiki_arc_url).toMatch(/^\/wiki\/arcs\//);
      expect(chapter.canon_refs.daizenshuu).toBeTruthy();
      expect(chapter.player.power_level).toBeGreaterThan(0);
      expect(chapter.enemy.power_level).toBeGreaterThan(0);
      expect(chapter.dialogue_intro.length).toBeGreaterThanOrEqual(1);
      expect(chapter.dialogue_victory.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("verifies power level ratios across all sagas", () => {
    // Check Pilaf (early DB) vs Cell Games (Z mid) vs Beerus (Super god ki)
    const ch1 = getCanonChapter(1)!;
    const ch8 = getCanonChapter(8)!;
    const ch10 = getCanonChapter(10)!;

    expect(ch1.player.power_level).toBe(10);
    expect(ch8.player.power_level).toBe(1200000000);
    expect(ch10.enemy.power_level).toBe(15000000000);

    const mult1 = computeCanonPowerMultiplier(ch1.player.power_level, ch1.enemy.power_level);
    expect(mult1.playerDamageMultiplier).toBeGreaterThanOrEqual(0.65);
    expect(mult1.playerDamageMultiplier).toBeLessThanOrEqual(1.45);
  });
});
