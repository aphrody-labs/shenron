// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  getCanonStoryManifest,
  getCanonSagasWithChapters,
  getCanonChapter,
  computeCanonPowerMultiplier,
  formatMangaDialogues,
} from "../src/games/canon-scenario";

describe("Dragon Ball Canon Scenario Resolver", () => {
  it("loads the complete canonical manifest covering Toriyama's work", () => {
    const manifest = getCanonStoryManifest();
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.source_author).toBe("Akira Toriyama");
    expect(manifest.sagas.length).toBeGreaterThanOrEqual(10);
    expect(manifest.chapters.length).toBeGreaterThanOrEqual(10);
  });

  it("organizes chapters into chronological sagas with valid manga and anime URLs", () => {
    const sagas = getCanonSagasWithChapters();
    const saiyanSaga = sagas.find((s) => s.id === "saiyans");
    expect(saiyanSaga).toBeDefined();
    expect(saiyanSaga!.chapters.length).toBe(2);

    const raditzChapter = saiyanSaga!.chapters.find((c) => c.id === 5);
    expect(raditzChapter).toBeDefined();
    expect(raditzChapter!.canon_refs.manga_url).toContain("/wiki/manga/volume/17");
    expect(raditzChapter!.canon_refs.episode_id).toBe(875);
    expect(raditzChapter!.canon_refs.episode_url).toContain("/wiki/episodes/875");
    expect(raditzChapter!.canon_refs.daizenshuu).toContain("Daizenshuu 7");
  });

  it("fetches individual chapter and formats manga bilingual dialogue", () => {
    const chapter = getCanonChapter(7); // Super Saiyan Goku vs Frieza
    expect(chapter).toBeDefined();
    expect(chapter!.player.id).toBe("goku");
    expect(chapter!.enemy.id).toBe("frieza");
    expect(chapter!.dramatic_finish.move).toBe("angry_kamehameha");

    const dialogues = formatMangaDialogues(chapter!.dialogue_intro, "bilingual");
    expect(dialogues.length).toBe(2);
    expect(dialogues[0].speaker).toContain("Frieza");
    expect(dialogues[0].subContent).toContain("あと5分");
  });

  it("calculates Daizenshuu power level multipliers with logarithmic sanity", () => {
    // Goku SSJ (150,000,000) vs Frieza (120,000,000)
    const mult = computeCanonPowerMultiplier(150000000, 120000000);
    expect(mult.playerDamageMultiplier).toBeGreaterThan(1.0);
    expect(mult.enemyDamageMultiplier).toBeLessThan(1.0);
    expect(mult.scouterRatio).toBe(1.25);
  });
});
