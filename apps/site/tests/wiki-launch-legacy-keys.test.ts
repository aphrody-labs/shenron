/**
 * La configuration d'accès des rubriques (`WikiLaunch.data` en base) a été
 * enregistrée avec les anciennes clés françaises du registre (`personnages`,
 * `jeux`, `lieux`…). Les clés sont passées à l'anglais : la lecture doit les
 * ramener à la clé actuelle, sinon une rubrique ouverte en production se
 * refermerait (ou une rubrique réservée s'ouvrirait) au déploiement.
 */
import { beforeEach, describe, expect, test } from "bun:test";

let stored: unknown = null;

const { ALL_ENTRIES, LEGACY_ENTRY_KEYS, currentEntryKey, entryByKey } =
  await import("@aphrody/shenron-config/wiki-launch");

/** Chaque lecture repart d'un module neuf : le cache TTL de 30 s ne doit pas fausser le test. */
async function readConfig() {
  const { resolveLaunchConfig, DEFAULT_LAUNCH_CONFIG } =
    await import("@aphrody/shenron-config/wiki-launch-config");
  return stored ? resolveLaunchConfig(stored) : structuredClone(DEFAULT_LAUNCH_CONFIG);
}

describe("clés héritées du registre des rubriques", () => {
  test("chaque ancienne clé désigne une rubrique existante", () => {
    const keys = new Set(ALL_ENTRIES.map((entry) => entry.key));
    for (const [legacy, current] of Object.entries(LEGACY_ENTRY_KEYS)) {
      expect(keys.has(current)).toBe(true);
      expect(keys.has(legacy)).toBe(false);
      expect(currentEntryKey(legacy)).toBe(current);
      expect(entryByKey(legacy)?.key).toBe(current);
    }
  });

  test("aucune clé du registre n'est un mot français connu", () => {
    for (const entry of ALL_ENTRIES) expect(LEGACY_ENTRY_KEYS[entry.key]).toBeUndefined();
  });
});

describe("lecture de la configuration enregistrée avec les anciennes clés", () => {
  beforeEach(() => {
    stored = null;
  });

  test("openKeys, order et access sont ramenés aux clés actuelles", async () => {
    stored = {
      openKeys: ["personnages", "lieux", "objets"],
      order: ["jeux", "personnages", "classements", "episodes"],
      access: {
        puissances: { mode: "members", roleIds: [] },
        classements: { mode: "roles", roleIds: ["123456789012345678"] },
        musiques: { mode: "admin", roleIds: [] },
      },
    };
    const cfg = await readConfig();
    expect(cfg.openKeys).toEqual(expect.arrayContaining(["characters", "locations", "items"]));
    expect(cfg.openKeys).not.toContain("personnages");
    expect(cfg.order).toEqual(["games", "characters", "rankings", "episodes"]);
    expect(cfg.access).toEqual({
      "power-levels": { mode: "members", roleIds: [] },
      rankings: { mode: "roles", roleIds: ["123456789012345678"] },
      music: { mode: "admin", roleIds: [] },
    });
  });

  test("la clé \u00ab koharu \u00bb (nom de code) est lue comme \u00ab studio \u00bb", async () => {
    stored = {
      openKeys: ["koharu"],
      order: ["koharu", "atelier"],
      access: { koharu: { mode: "members", roleIds: [] } },
    };
    const cfg = await readConfig();
    expect(cfg.openKeys).toContain("studio");
    expect(cfg.openKeys).not.toContain("koharu");
    expect(cfg.order).toEqual(["studio", "workshop"]);
    // Rubrique toujours ouverte : sa règle d'accès n'est pas retenue (ni sous l'ancienne clé, ni sous la nouvelle).
    expect(cfg.access).toEqual({});
  });

  test("une règle enregistrée sous la clé actuelle l'emporte sur l'ancienne", async () => {
    stored = {
      openKeys: [],
      order: [],
      access: {
        characters: { mode: "public", roleIds: [] },
        personnages: { mode: "admin", roleIds: [] },
      },
    };
    const cfg = await readConfig();
    expect(cfg.access.characters).toEqual({ mode: "public", roleIds: [] });
  });
});
