/**
 * Intégrité de l'économie et de la progression contre la vraie base de test :
 * achats concurrents, XP concurrente, débit plafonné, fusion exclusive,
 * progression de palier et gain vocal de base.
 */
import "./setup"; // must be first
import { describe, expect, mock, test } from "bun:test";
import { container } from "tsyringe";
import { eq } from "drizzle-orm";
import type { GuildMember } from "discord.js";
import { DatabaseService } from "~/db/index";
import { fusions, inventory, shopItems, users } from "~/db/schema";
import { getLevelThresholds, xpProgress } from "~/lib/xp";
import { loadMessageXpConfig, loadVoiceBaseGain } from "~/lib/xp-boosts";
import { RACE_LEVEL_ROLES } from "~/lib/race-levels";
import { XP_PER_VOICE_TICK } from "~/lib/constants";

const { EconomyService } = await import("~/services/EconomyService");
const { LevelService } = await import("~/services/LevelService");

const dbs = container.resolve(DatabaseService);
const eco = container.resolve(EconomyService);
const levels = container.resolve(LevelService);

async function freshUser(id: string, values: Partial<typeof users.$inferInsert> = {}) {
  await dbs.db.delete(users).where(eq(users.id, id));
  await dbs.db.insert(users).values({ id, ...values });
}

describe("boutique", () => {
  test("un double achat simultané ne débite qu'une fois", async () => {
    const id = "test-eco-double-buy";
    await freshUser(id, { zeni: 1_000 });
    await dbs.db
      .insert(shopItems)
      .values({ key: "eco_double", type: "badge", name: "Badge", price: 300, enabled: true })
      .onConflictDoNothing();
    const [a, b] = await Promise.all([
      eco.purchase(id, "eco_double"),
      eco.purchase(id, "eco_double"),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await eco.getBalance(id)).toBe(700);
    const owned = await dbs.db.select().from(inventory).where(eq(inventory.userId, id));
    expect(owned).toHaveLength(1);
  });

  test("équiper remplace le rôle de l'objet précédent du même emplacement", async () => {
    const id = "test-eco-equip-role";
    await freshUser(id, { equippedColor: "eco_red" });
    await dbs.db
      .insert(shopItems)
      .values([
        { key: "eco_red", type: "color", name: "Rouge", price: 1, roleId: "role-red" },
        { key: "eco_blue", type: "color", name: "Bleu", price: 1, roleId: "role-blue" },
      ])
      .onConflictDoNothing();
    await eco.grantItem(id, "color", "eco_blue");
    const held = new Set(["role-red"]);
    const member = {
      id,
      roles: {
        cache: { has: (r: string) => held.has(r) },
        add: mock(async (r: string) => held.add(r)),
        remove: mock(async (r: string) => held.delete(r)),
      },
    } as unknown as GuildMember;
    const res = await eco.equipCosmetic(member, "color", "eco_blue");
    expect(res).toEqual({ ok: true, previous: "eco_red", roleGranted: true });
    expect([...held]).toEqual(["role-blue"]);
    expect(await eco.equippedKey(id, "color")).toBe("eco_blue");
  });
});

describe("solde", () => {
  test("le retrait admin est plafonné au solde et rapporte le montant réel", async () => {
    const id = "test-eco-remove-upto";
    await freshUser(id, { zeni: 250 });
    expect(await eco.removeZeniUpTo(id, 1_000)).toBe(250);
    expect(await eco.getBalance(id)).toBe(0);
    expect(await eco.removeZeniUpTo(id, 10)).toBe(0);
  });

  test("un débit fractionnaire est tronqué, jamais un solde décimal", async () => {
    const id = "test-eco-trunc";
    await freshUser(id, { zeni: 100 });
    expect(await eco.removeZeni(id, 10.9)).toBe(true);
    expect(await eco.getBalance(id)).toBe(90);
  });
});

describe("fusion", () => {
  test("un membre déjà fusionné ne peut pas sceller une seconde union", async () => {
    const [a, b, c] = ["test-fu-a", "test-fu-b", "test-fu-c"];
    for (const id of [a, b, c]) await freshUser(id);
    await dbs.db.delete(fusions);
    const results = await Promise.all([eco.createFusion(a, b), eco.createFusion(b, c)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await dbs.db.select().from(fusions)).toHaveLength(1);
    expect(await eco.createFusion(a, a)).toBe(false);
    await dbs.db.delete(fusions);
  });
});

describe("XP", () => {
  test("des gains simultanés s'additionnent tous", async () => {
    const id = "test-xp-concurrent";
    await freshUser(id, { xp: 0 });
    await Promise.all(
      Array.from({ length: 20 }, () => levels.addXP(id, 10, { propagateFusion: false })),
    );
    expect((await levels.findUser(id))?.xp).toBe(200);
  });

  test("la progression avant le premier palier n'est pas nulle", () => {
    const first = getLevelThresholds()[0]!;
    const p = xpProgress(first.xp / 2);
    expect(p.level).toBe(0);
    expect(p.floor).toBe(0);
    expect(p.ratio).toBeCloseTo(0.5, 5);
    expect(p.remaining).toBe(first.xp / 2);
  });

  test("au-delà du dernier palier : niveau max, barre pleine", () => {
    const last = getLevelThresholds().at(-1)!;
    const p = xpProgress(99_999_999_999);
    expect(p.level).toBe(last.level);
    expect(p.next).toBeUndefined();
    expect(p.ratio).toBe(1);
    expect(p.remaining).toBe(0);
  });
});

describe("réglages de gain", () => {
  const reader = (values: Record<string, number>) => ({
    getInt: async (k: string, d: number) => values[k] ?? d,
    getFloat: async (k: string, d: number) => values[k] ?? d,
    getBool: async (_k: string, d: boolean) => d,
    getString: async (_k: string, d: string) => d,
  });

  test("gain vocal : le réglage par minute, sinon le défaut par tick", async () => {
    expect((await loadVoiceBaseGain(reader({}))).perTick).toBe(XP_PER_VOICE_TICK);
    expect((await loadVoiceBaseGain(reader({ "xp.voice.per_minute": 30 }))).perMinute).toBe(30);
  });

  test("un maximum sous le minimum est relevé au minimum", async () => {
    const cfg = await loadMessageXpConfig(reader({ "xp.message.min": 40, "xp.message.max": 10 }));
    expect(cfg).toMatchObject({ min: 40, max: 40 });
  });
});

describe("paliers de race", () => {
  test("la race tout juste posée l'emporte sur le cache des rôles", async () => {
    const id = "test-race-override";
    await freshUser(id, { xp: 0, lastLevelReached: 0 });
    // Le cache porte encore un palier Saiyan alors que le membre passe Namek.
    const held = new Set([RACE_LEVEL_ROLES.saiyan[1]!]);
    const remove = mock(async (ids: string[]) => ids.forEach((r) => held.delete(r)));
    const member = {
      id,
      roles: {
        cache: { has: (r: string) => held.has(r) },
        remove,
        add: mock(async (r: string) => held.add(r)),
        highest: { position: 0 },
      },
      guild: { roles: { cache: new Map(), fetch: async () => null }, members: { me: null } },
    } as unknown as GuildMember;
    // Namek n'a pas d'échelle par défaut : rien n'est retiré.
    await levels.syncRaceLevelRoles(member, "namek");
    expect(remove).not.toHaveBeenCalled();
  });
});
