import { describe, expect, test } from "bun:test";
import { DEFAULT_POWER_SCALING_CONFIG } from "../src/lib/canon-engine";
import {
  buildCharacterLiveVersionChoices,
  classifyCharacterProfileBucket,
  isTransformedCharacterForm,
  resolveCharacterSagaOfficialReadings,
  sortCharacterTransformations,
  stripCharacterVersionSuffix,
} from "../src/lib/character-page-helpers";

const gokuLabels = {
  xenoGoku: "Xeno Goku",
  gokuCc: "Goku CC",
  gokuFusion: "Goku Fusion",
  gokuJumpForce: "Goku JumpForce",
};

describe("character-page-helpers", () => {
  test("strips both parenthetical suffixes and God Fusion suffix", () => {
    expect(stripCharacterVersionSuffix("Son Goku (Xeno)")).toBe("Son Goku");
    expect(stripCharacterVersionSuffix("Son Goku (GT) (Xeno)")).toBe("Son Goku");
    expect(stripCharacterVersionSuffix("Son Gokû God Fusion")).toBe("Son Gokû");
    expect(stripCharacterVersionSuffix("Son Goku")).toBe("Son Goku");
  });

  test("does not classify Base / multi-form summaries as transformed-only portraits", () => {
    expect(isTransformedCharacterForm(null)).toBe(false);
    expect(isTransformedCharacterForm("Base")).toBe(false);
    expect(isTransformedCharacterForm("Base / Super Saiyan")).toBe(false);
    expect(isTransformedCharacterForm("Forme de base / Kaioken")).toBe(false);
    expect(isTransformedCharacterForm("Super Saiyan")).toBe(true);
    expect(isTransformedCharacterForm("Ultra Instinct")).toBe(true);
    expect(isTransformedCharacterForm("Ōzaru (Grand Singe)")).toBe(true);
  });

  test("sorts Goku transformations in canonical progression order", () => {
    const unsorted = [
      { id: 3, name: "Super Saiyan 3", slug: "super-saiyan-3" },
      { id: 10, name: "Ultra Instinct", slug: "ultra-instinct" },
      { id: 4, name: "Super Saiyan 4", slug: "super-saiyan-4" },
      { id: 24, name: "Ōzaru (Grand Singe)", slug: "ozaru" },
      { id: 6, name: "Super Saiyan Blue", slug: "super-saiyan-blue" },
      { id: 1, name: "Super Saiyan", slug: "super-saiyan" },
      { id: 5, name: "Super Saiyan God", slug: "super-saiyan-god" },
      { id: 2, name: "Super Saiyan 2", slug: "super-saiyan-2" },
    ];
    expect(sortCharacterTransformations(unsorted).map((item) => item.id)).toEqual([
      24, 1, 2, 3, 4, 5, 6, 10,
    ]);
  });

  test("merges root-only continuities with character.versions so all 4 Goku identities appear", () => {
    const choices = buildCharacterLiveVersionChoices({
      currentCharacter: { id: 1, name: "Son Goku", slug: "son-goku" },
      continuities: [{ id: 1, name: "Son Goku", slug: "son-goku", label: null, isMain: true }],
      versions: [
        { id: 1158, name: "Son Goku (CC)", slug: "son-goku-cc" },
        { id: 1344, name: "Son Goku (Jump Force)", slug: "son-goku-jump-force" },
        { id: 1149, name: "Son Goku (Xeno)", slug: "son-goku-xeno" },
        { id: 1152, name: "Son Gokû God Fusion", slug: "son-goku-god-fusion" },
      ],
      gokuLabels,
    });

    expect(choices.map((item) => [item.id, item.name])).toEqual([
      [1149, "Xeno Goku"],
      [1158, "Goku CC"],
      [1152, "Goku Fusion"],
      [1344, "Goku JumpForce"],
    ]);
  });

  test("keeps main Son Goku reachable from alternate Goku identity pages", () => {
    const choices = buildCharacterLiveVersionChoices({
      currentCharacter: { id: 1149, name: "Son Goku (Xeno)", slug: "son-goku-xeno" },
      continuities: [],
      versions: [
        { id: 1, name: "Son Goku", slug: "son-goku" },
        { id: 1158, name: "Son Goku (CC)", slug: "son-goku-cc" },
        { id: 1152, name: "Son Gokû God Fusion", slug: "son-goku-god-fusion" },
      ],
      gokuLabels,
    });

    expect(choices[0]).toMatchObject({ id: 1, name: "Son Goku", isMain: true });
    expect(choices.map((item) => item.id)).toEqual([1, 1158, 1152]);
  });

  test("resolves official battle powers across Pilaf, Saiyan, Namek, and Freezer sagas", () => {
    const bps = DEFAULT_POWER_SCALING_CONFIG.officialBps;

    const pilaf = resolveCharacterSagaOfficialReadings({
      characterId: 1,
      characterName: "Son Goku",
      variantSagaName: "Saga de Pilaf",
      variantSagaSlug: "pilaf",
      hasSeparateFreezerSaga: true,
      officialBps: bps,
    });
    expect(pilaf.map((r) => r.bp)).toEqual([10, 100]);

    const saiyan = resolveCharacterSagaOfficialReadings({
      characterId: 1,
      characterName: "Son Goku",
      variantSagaName: "Saga Saiyan",
      variantSagaSlug: "saiyan",
      hasSeparateFreezerSaga: true,
      officialBps: bps,
    });
    expect(saiyan.map((r) => r.bp)).toEqual([334, 416, 924, 5000, 8000, 24000, 32000]);

    const namek = resolveCharacterSagaOfficialReadings({
      characterId: 1,
      characterName: "Son Goku",
      variantSagaName: "Saga Namek",
      variantSagaSlug: "namek",
      hasSeparateFreezerSaga: true,
      officialBps: bps,
    });
    expect(namek.map((r) => r.bp)).toEqual([90000, 180000]);

    const freezer = resolveCharacterSagaOfficialReadings({
      characterId: 1,
      characterName: "Son Goku",
      variantSagaName: "Saga Freezer",
      variantSagaSlug: "saga_freezer",
      hasSeparateFreezerSaga: true,
      officialBps: bps,
    });
    expect(freezer.map((r) => r.bp)).toEqual([3000000, 30000000, 60000000, 150000000]);
  });

  test("routes power scaling sections containing 'niveaux de combat' to powers bucket", () => {
    expect(
      classifyCharacterProfileBucket(
        "niveaux-de-combat-et-power-scaling-officiel",
        "Niveaux de combat et Power Scaling officiel (Daizenshuu 7 & SEG)",
      ),
    ).toBe("powers");
    expect(classifyCharacterProfileBucket("history-battles", "Histoire par saga")).toBe("history");
    expect(classifyCharacterProfileBucket("relations", "Relations de Goku")).toBe("relations");
    expect(classifyCharacterProfileBucket("personnalite", "Personnalité")).toBe("additional");
  });
});
