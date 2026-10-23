/**
 * `/config xp-boost-set`: a multiplier above the cumulative cap is refused and the attempt
 * logged with its author (cyborg/mutant roles had been set to x10,000,000 without a trace).
 */
import "./setup"; // must be first
import { describe, expect, mock, test } from "bun:test";
import { container } from "tsyringe";
import { eq } from "drizzle-orm";
import type { CommandInteraction, Role } from "discord.js";
import { DatabaseService } from "~/db/index";
import { actionLogs, guildSettings } from "~/db/schema";
import { XP_BOOST_ROLE_CAP, roleBoostLimit } from "~/lib/xp-boosts";

const { ConfigCommand } = await import("~/commands/admin/Config");
const { SettingsService, XP_BOOST_ROLE_PREFIX } = await import("~/services/SettingsService");

const dbs = container.resolve(DatabaseService);
const settings = container.resolve(SettingsService);
const config = container.resolve(ConfigCommand);

const ROLE = {
  id: "123456789012345678",
  toString: () => "<@&123456789012345678>",
} as unknown as Role;

function interaction(userId: string) {
  const reply = mock(async (_payload: unknown) => undefined);
  return { value: { user: { id: userId }, reply } as unknown as CommandInteraction, reply };
}

async function setMax(value: string | null) {
  if (value === null)
    await dbs.db.delete(guildSettings).where(eq(guildSettings.key, "xp.multiplier.max"));
  else {
    await dbs.db
      .insert(guildSettings)
      .values({ key: "xp.multiplier.max", value })
      .onConflictDoUpdate({ target: guildSettings.key, set: { value } });
  }
  settings.invalidate();
}

describe("roleBoostLimit", () => {
  test("plafond cumulé, jamais plus de 100 000, jamais moins de 1", () => {
    expect(roleBoostLimit(10)).toBe(10);
    expect(roleBoostLimit(1e9)).toBe(XP_BOOST_ROLE_CAP);
    expect(roleBoostLimit(0)).toBe(1);
    expect(roleBoostLimit(Number.NaN)).toBe(1);
  });
});

describe("/config xp-boost-set", () => {
  test("refuse ×10 000 000 au-dessus du plafond et journalise la tentative", async () => {
    await setMax("100000");
    const i = interaction("admin-1");
    await config.xpBoostSet(ROLE, 10_000_000, i.value);
    expect(await settings.getRaw(`${XP_BOOST_ROLE_PREFIX}${ROLE.id}`)).toBeUndefined();
    const logs = await dbs.db.select().from(actionLogs).where(eq(actionLogs.action, "CONFIG_SET"));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.moderatorId).toBe("admin-1");
    expect(JSON.parse(logs[0]!.meta!)).toMatchObject({
      refused: true,
      value: "10000000",
      limit: 100_000,
    });
  });

  test("accepte un boost dans la limite, le journalise avec l'ancienne valeur", async () => {
    await setMax("100000");
    const i = interaction("admin-2");
    await config.xpBoostSet(ROLE, 50, i.value);
    expect(await settings.getRaw(`${XP_BOOST_ROLE_PREFIX}${ROLE.id}`)).toBe("50");
    await config.xpBoostSet(ROLE, 100, i.value);
    const logs = (await dbs.db.select().from(actionLogs).where(eq(actionLogs.action, "CONFIG_SET")))
      .filter((l) => l.moderatorId === "admin-2")
      .map((l) => JSON.parse(l.meta!));
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({ value: "100", previous: "50" });
    expect(logs[1].refused).toBeUndefined();
  });

  test("le plafond suit xp.multiplier.max (défaut 10)", async () => {
    await setMax(null);
    const i = interaction("admin-3");
    await config.xpBoostSet(ROLE, 11, i.value);
    expect(await settings.getRaw(`${XP_BOOST_ROLE_PREFIX}${ROLE.id}`)).toBe("100");
  });
});
