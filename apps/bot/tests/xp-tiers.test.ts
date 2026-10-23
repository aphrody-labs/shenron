/**
 * Regression of 2026-10-23: "Perfect Ultra Instinct" (x32,000) at level 17.
 *
 * Tier roles are also XP multiplier roles. The production ladder mixed the real ladder
 * (levels 2 to 50) with ten leftover rows from an old seed (levels 1 to 10): every level-10
 * Saiyan held the level-45 tiers, and their multiplier multiplied their gains by 32,000.
 */
import "./setup"; // must be first
import { describe, expect, mock, test } from "bun:test";
import { container } from "tsyringe";
import { eq } from "drizzle-orm";
import type { Guild, GuildMember } from "discord.js";
import { DatabaseService } from "~/db/index";
import { users } from "~/db/schema";
import {
  DEFAULT_LEVEL_RACE,
  RACE_LEVEL_ROLES,
  findLadderConflict,
  levelOfRoleId,
  normalizeLadder,
  planTierRoles,
  raceLevelRoleIds,
  tierEntitlement,
} from "~/lib/race-levels";
import { RACES } from "~/lib/races";
import { bestRoleMultiplier } from "~/lib/xp-boosts";
import { setLevelThresholds } from "~/lib/xp";

const { LevelService } = await import("~/services/LevelService");

const SAIYAN = RACE_LEVEL_ROLES.saiyan;
const at = (level: number) => SAIYAN[level]!;
const KAIOKEN = at(8);
const SSJ = at(15);
const PERFECT_UI = at(45);
/** The seven leftover production rows (levels 1, 3, 4, 6, 7, 9, 10). */
const STALE = {
  1: KAIOKEN,
  3: at(20),
  4: at(30),
  6: at(32),
  7: at(35),
  9: at(40),
  10: PERFECT_UI,
};

describe("échelle canonique", () => {
  test("14 paliers Saiyan de 2 à 50, Perfect UI au niveau 45", () => {
    expect(Object.keys(SAIYAN).map(Number)).toEqual([
      2, 5, 8, 15, 20, 30, 32, 35, 38, 40, 42, 45, 48, 50,
    ]);
    expect(levelOfRoleId(PERFECT_UI)).toBe(45);
    expect(new Set(Object.values(SAIYAN)).size).toBe(14);
  });

  test("au niveau 17 un Saiyan n'a droit qu'à Ozaru, Zenkaï, Kaioken et Super Saiyan", () => {
    expect(raceLevelRoleIds("saiyan", 17)).toEqual([at(2), at(5), at(8), at(15)]);
    expect(raceLevelRoleIds("saiyan", 17)).not.toContain(PERFECT_UI);
  });

  test("un membre sans rôle de race suit l'échelle Saiyan (conception voulue)", () => {
    expect(DEFAULT_LEVEL_RACE).toBe("saiyan");
  });
});

describe("normalizeLadder", () => {
  test("le même rôle à plusieurs niveaux n'est retenu qu'au plus haut", () => {
    const polluted = { ...STALE, ...SAIYAN };
    const { ladder, shadowed } = normalizeLadder(polluted);
    expect(ladder).toEqual(SAIYAN);
    expect(shadowed.map((s) => s.level)).toEqual([1, 3, 4, 6, 7, 9, 10]);
    expect(shadowed.find((s) => s.level === 10)).toMatchObject({
      roleId: PERFECT_UI,
      keptLevel: 45,
    });
  });

  test("une échelle sans doublon est inchangée", () => {
    expect(normalizeLadder(SAIYAN)).toEqual({ ladder: SAIYAN, shadowed: [] });
  });
});

describe("findLadderConflict", () => {
  test("refuse un rôle déjà posé à un autre niveau, accepte le même niveau", () => {
    expect(findLadderConflict(SAIYAN, 10, PERFECT_UI)).toEqual({ level: 45 });
    expect(findLadderConflict(SAIYAN, 45, PERFECT_UI)).toBeNull();
    expect(findLadderConflict(SAIYAN, 10, "999999999999999999")).toBeNull();
  });
});

describe("multiplicateur d'XP lié au niveau", () => {
  const boosts = [
    { roleId: KAIOKEN, multiplier: 20 },
    { roleId: SSJ, multiplier: 50 },
    { roleId: PERFECT_UI, multiplier: 32_000 },
  ];

  test("Perfect UI porté au niveau 17 ne multiplie rien : le meilleur palier dû reste", () => {
    const has = () => true;
    const entitled = tierEntitlement(17, "saiyan");
    expect(entitled(PERFECT_UI)).toBe(false);
    expect(bestRoleMultiplier(has, boosts, 1, entitled)).toBe(50);
    // Sans l'éligibilité, c'est l'explosion observée en production.
    expect(bestRoleMultiplier(has, boosts, 1)).toBe(32_000);
  });

  test("au niveau 45 le palier est dû", () => {
    expect(bestRoleMultiplier(() => true, boosts, 1, tierEntitlement(45, "saiyan"))).toBe(32_000);
  });

  test("un rôle hors échelle (booster, événement) reste toujours éligible", () => {
    expect(tierEntitlement(0, "saiyan")("123456789012345678")).toBe(true);
  });
});

describe("planTierRoles", () => {
  test("distingue ce qui manque, ce qui dépasse le niveau et les paliers d'une autre race", () => {
    const held = new Set([at(2), PERFECT_UI, SSJ]);
    const plan = planTierRoles({ race: "saiyan", level: 10, has: (r) => held.has(r) });
    expect(plan.entitled).toEqual([at(2), at(5), at(8)]);
    expect(plan.add).toEqual([at(5), at(8)]);
    expect(plan.above.toSorted()).toEqual([PERFECT_UI, SSJ].toSorted());
    expect(plan.foreign).toEqual([]);
  });

  test("sans race, tous les paliers portés sont étrangers", () => {
    const plan = planTierRoles({ race: null, level: 50, has: (r) => r === SSJ });
    expect(plan.entitled).toEqual([]);
    expect(plan.foreign).toEqual([SSJ]);
  });
});

// ── Sync against the real test database ─────────────────────────────────────

const dbs = container.resolve(DatabaseService);
const levels = container.resolve(LevelService);

function fakeMember(id: string, roleIds: string[], bot = false) {
  const held = new Set(roleIds);
  const remove = mock(async (ids: string | string[]) => {
    for (const r of [ids].flat()) held.delete(r);
  });
  const add = mock(async (rid: string) => held.add(rid));
  const value = {
    id,
    user: { bot },
    roles: { cache: { has: (r: string) => held.has(r) }, remove, add, highest: { position: 0 } },
    guild: {
      roles: {
        cache: new Map(Object.values(SAIYAN).map((r) => [r, { position: 0 }])),
        fetch: async () => null,
      },
      members: { me: null },
    },
  } as unknown as GuildMember;
  return { value, held, remove, add };
}

async function seedUser(id: string, xp: number) {
  await dbs.db.delete(users).where(eq(users.id, id));
  await dbs.db.insert(users).values({ id, xp, lastLevelReached: 0 });
}

describe("syncRaceLevelRoles — retrait des paliers en trop", () => {
  // Test curve: level n at 100 * n XP, so a member's level can be read from their XP.
  setLevelThresholds(Array.from({ length: 50 }, (_, i) => ({ level: i + 1, xp: (i + 1) * 100 })));

  test("sans demande explicite, rien de sa propre échelle n'est retiré", async () => {
    await seedUser("tier-keep", 1_700); // niveau 17
    const m = fakeMember("tier-keep", [PERFECT_UI, at(2)]);
    const res = await levels.syncRaceLevelRoles(m.value);
    expect(m.remove).not.toHaveBeenCalled();
    expect(res?.plan.above).toEqual([PERFECT_UI]);
    expect(m.held.has(PERFECT_UI)).toBe(true);
  });

  test("avec removal=all, le palier au-dessus du niveau est retiré et les dus sont posés", async () => {
    await seedUser("tier-strip", 1_700); // niveau 17
    const m = fakeMember("tier-strip", [PERFECT_UI, at(2)]);
    const res = await levels.syncRaceLevelRoles(m.value, undefined, { removal: "all" });
    expect(res?.removed).toEqual([PERFECT_UI]);
    expect(m.held.has(PERFECT_UI)).toBe(false);
    expect([...m.held].toSorted()).toEqual([at(2), at(5), at(8), at(15)].map(String).toSorted());
    // Le niveau stocké suit l'XP et le palier courant est le plus haut dû.
    const row = (await levels.findUser("tier-strip"))!;
    expect(row.lastLevelReached).toBe(17);
    expect(row.currentLevelRoleId).toBe(at(15));
  });

  test("une ligne à XP nulle (base vide ou restaurée) n'autorise aucun retrait", async () => {
    await seedUser("tier-empty", 0);
    const m = fakeMember("tier-empty", [PERFECT_UI]);
    const res = await levels.syncRaceLevelRoles(m.value, undefined, { removal: "all" });
    expect(res?.suspect).toBe(true);
    expect(m.remove).not.toHaveBeenCalled();
  });

  test("un membre absent de la base n'est pas touché", async () => {
    const m = fakeMember("tier-unknown", [PERFECT_UI]);
    expect(await levels.syncRaceLevelRoles(m.value, undefined, { removal: "all" })).toBeUndefined();
    expect(m.remove).not.toHaveBeenCalled();
  });

  test("les paliers d'une autre race se retirent au changement de race", async () => {
    await seedUser("tier-foreign", 9_000);
    // Race Namek posée à l'instant mais sans échelle : garde « aucune échelle » → rien ne bouge.
    const m = fakeMember("tier-foreign", [RACES.namek.roleId, SSJ]);
    const res = await levels.syncRaceLevelRoles(m.value, "namek");
    expect(res?.skipped).toBe("no-ladder");
    expect(m.remove).not.toHaveBeenCalled();
  });
});

describe("reconcileAllRaceLevelRoles", () => {
  setLevelThresholds(Array.from({ length: 50 }, (_, i) => ({ level: i + 1, xp: (i + 1) * 100 })));

  async function guildOf(count: number, excess: number) {
    const members = [];
    for (let i = 0; i < count; i++) {
      const id = `rec-${count}-${excess}-${i}`;
      await seedUser(id, 1_700); // niveau 17
      members.push(fakeMember(id, i < excess ? [PERFECT_UI] : [at(2)]));
    }
    const guild = {
      members: { cache: new Map(members.map((m) => [m.value.id, m.value])) },
    } as unknown as Guild;
    return { guild, members };
  }

  test("par défaut : constate l'excédent, ne retire rien", async () => {
    const { guild, members } = await guildOf(10, 2);
    const stats = await levels.reconcileAllRaceLevelRoles(guild);
    expect(stats).toMatchObject({ mode: "report", excessMembers: 2, removedRoles: 0, failed: 0 });
    expect(stats.sample).toHaveLength(2);
    expect(members.every((m) => m.remove.mock.calls.length === 0)).toBe(true);
  });

  test("strip=true : retire l'excédent des membres touchés", async () => {
    const { guild, members } = await guildOf(10, 3);
    const stats = await levels.reconcileAllRaceLevelRoles(guild, { strip: true });
    expect(stats).toMatchObject({ mode: "apply", excessMembers: 3, removedRoles: 3 });
    expect(members.filter((m) => m.held.has(PERFECT_UI))).toHaveLength(0);
  });

  test("strip=true : si plus de la moitié des membres seraient touchés, rien n'est retiré", async () => {
    const { guild, members } = await guildOf(10, 8);
    const stats = await levels.reconcileAllRaceLevelRoles(guild, { strip: true });
    expect(stats).toMatchObject({ mode: "report", aborted: "share", removedRoles: 0 });
    expect(members.filter((m) => m.held.has(PERFECT_UI))).toHaveLength(8);
  });

  test("les bots ne sont pas parcourus", async () => {
    const bot = fakeMember("rec-bot", [PERFECT_UI], true);
    const guild = { members: { cache: new Map([["rec-bot", bot.value]]) } } as unknown as Guild;
    const stats = await levels.reconcileAllRaceLevelRoles(guild, { strip: true });
    expect(stats.scanned).toBe(0);
  });
});
