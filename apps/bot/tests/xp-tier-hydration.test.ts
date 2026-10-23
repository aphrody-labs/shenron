/**
 * Hydration of the tier ladder from `race_level_roles`: never any automatic seeding, and a
 * leftover role at a low level does not open a high tier.
 */
import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { raceLevelRoles } from "~/db/schema";
import {
  RACE_LEVEL_ROLES,
  hasRaceLadder,
  levelOfRoleId,
  loadRaceLevelRoles,
  raceLevelRoleIds,
  reloadRaceLevelRoles,
} from "~/lib/race-levels";

const dbs = container.resolve(DatabaseService);
const SAIYAN = RACE_LEVEL_ROLES.saiyan;
const at = (level: number) => SAIYAN[level]!;
const PERFECT_UI = at(45);

describe("loadRaceLevelRoles", () => {
  test("une table vide reste vide : aucun seed, donc aucun palier", () => {
    dbs.db.delete(raceLevelRoles).run();
    loadRaceLevelRoles(dbs.db);
    expect(dbs.db.select().from(raceLevelRoles).all()).toHaveLength(0);
    expect(hasRaceLadder("saiyan")).toBe(false);
    expect(raceLevelRoleIds("saiyan", 50)).toEqual([]);
  });

  test("les sept lignes résiduelles de production n'ouvrent pas Perfect UI au niveau 10", () => {
    const real = Object.entries(SAIYAN).map(([level, roleId]) => ({
      race: "saiyan",
      level: Number(level),
      roleId: roleId!,
    }));
    const stale = [
      { race: "saiyan", level: 1, roleId: at(8) },
      { race: "saiyan", level: 3, roleId: at(20) },
      { race: "saiyan", level: 4, roleId: at(30) },
      { race: "saiyan", level: 6, roleId: at(32) },
      { race: "saiyan", level: 7, roleId: at(35) },
      { race: "saiyan", level: 9, roleId: at(40) },
      { race: "saiyan", level: 10, roleId: PERFECT_UI },
    ];
    dbs.db.delete(raceLevelRoles).run();
    dbs.db
      .insert(raceLevelRoles)
      .values([...real, ...stale])
      .run();
    reloadRaceLevelRoles();

    expect(raceLevelRoleIds("saiyan", 10)).toEqual([at(2), at(5), at(8)]);
    expect(raceLevelRoleIds("saiyan", 17)).not.toContain(PERFECT_UI);
    expect(raceLevelRoleIds("saiyan", 45)).toContain(PERFECT_UI);
    expect(levelOfRoleId(PERFECT_UI)).toBe(45);
  });
});
