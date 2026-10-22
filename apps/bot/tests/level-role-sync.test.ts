/**
 * Régression du 2026-10-22 : base `users` vide, la passe de réconciliation a retiré
 * 210 paliers de la propre race des membres. Un palier de sa race ne se retire plus,
 * et un membre absent de la base n'est pas touché.
 */
import "./setup";
import { describe, expect, mock, test } from "bun:test";
import { container } from "tsyringe";
import type { GuildMember } from "discord.js";
import { DatabaseService } from "~/db/index";
import { users } from "~/db/schema";
import { RACE_LEVEL_ROLES } from "~/lib/race-levels";
import { LevelService } from "~/services/LevelService";

function member(id: string, roleIds: string[]) {
  const held = new Set(roleIds);
  const remove = mock(async (ids: string[]) => ids.forEach((r) => held.delete(r)));
  const add = mock(async (rid: string) => held.add(rid));
  const value = {
    id,
    roles: {
      cache: { has: (rid: string) => held.has(rid) },
      remove,
      add,
      highest: { position: 0 },
    },
    guild: { roles: { cache: new Map(), fetch: async () => null }, members: { me: null } },
  } as unknown as GuildMember;
  return { value, remove, add };
}

describe("syncRaceLevelRoles", () => {
  const saiyan = RACE_LEVEL_ROLES.saiyan;

  test("un membre absent de la base garde tous ses paliers", async () => {
    const levels = container.resolve(LevelService);
    const m = member("900000000000000001", [saiyan[5]!, saiyan[8]!]);
    await levels.syncRaceLevelRoles(m.value);
    expect(m.remove).not.toHaveBeenCalled();
  });

  test("un palier de sa race au-delà du niveau en base n'est pas retiré", async () => {
    const dbs = container.resolve(DatabaseService);
    await dbs.db.insert(users).values({ id: "900000000000000002", xp: 0 });
    const levels = container.resolve(LevelService);
    const m = member("900000000000000002", [saiyan[8]!]);
    await levels.syncRaceLevelRoles(m.value);
    expect(m.remove).not.toHaveBeenCalled();
  });
});
