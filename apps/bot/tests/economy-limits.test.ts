/**
 * Bounds and atomicity of the economy: balance never negative nor beyond the exact integer,
 * purchase without lost zeni, a ledger that does not fail a credit, tier zeni paid for each
 * level crossed, frozen account respected.
 */
import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { eq } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { inventory, shopItems, users } from "~/db/schema";

const { EconomyService, ZENI_MAX } = await import("~/services/EconomyService");
const { LevelService } = await import("~/services/LevelService");

const dbs = container.resolve(DatabaseService);
const eco = container.resolve(EconomyService);
const levels = container.resolve(LevelService);

async function freshUser(id: string, values: Partial<typeof users.$inferInsert> = {}) {
  await dbs.db.delete(users).where(eq(users.id, id));
  await dbs.db.insert(users).values({ id, ...values });
}

describe("bornes du solde", () => {
  test("un crédit énorme est borné à l'entier exact, jamais un nombre flottant", async () => {
    const id = "eco-lim-huge";
    await freshUser(id, { zeni: 10 });
    await eco.addZeni(id, 1e300, { propagateFusion: false, source: "admin" });
    expect(await eco.getBalance(id)).toBe(ZENI_MAX);
    const raw = dbs.sqlite.query("SELECT typeof(zeni) AS t FROM users WHERE id = ?").get(id) as {
      t: string;
    };
    expect(raw.t).toBe("integer");
    await eco.addZeni(id, 5, { propagateFusion: false, source: "admin" });
    expect(await eco.getBalance(id)).toBe(ZENI_MAX);
  });

  test("un crédit négatif ne peut pas rendre le solde négatif", async () => {
    const id = "eco-lim-neg";
    await freshUser(id, { zeni: 30 });
    await eco.addZeni(id, -500, { propagateFusion: false, source: "admin" });
    expect(await eco.getBalance(id)).toBe(0);
  });

  test("setZeni est borné des deux côtés", async () => {
    const id = "eco-lim-set";
    await freshUser(id);
    await eco.setZeni(id, 1e300);
    expect(await eco.getBalance(id)).toBe(ZENI_MAX);
    await eco.setZeni(id, -9);
    expect(await eco.getBalance(id)).toBe(0);
  });

  test("un compte gelé ne reçoit rien (hors admin)", async () => {
    const id = "eco-lim-frozen";
    await freshUser(id, { zeni: 100, zeniFrozen: true });
    await eco.addZeni(id, 50, { source: "daily", applyRace: false });
    expect(await eco.getBalance(id)).toBe(100);
    await eco.addZeni(id, 50, { source: "admin", propagateFusion: false });
    expect(await eco.getBalance(id)).toBe(150);
  });
});

describe("boutique atomique", () => {
  test("solde insuffisant : ni objet ni débit", async () => {
    const id = "eco-lim-poor";
    await freshUser(id, { zeni: 10 });
    await dbs.db
      .insert(shopItems)
      .values({ key: "eco_lim_item", type: "badge", name: "Badge", price: 300, enabled: true })
      .onConflictDoNothing();
    const res = await eco.purchase(id, "eco_lim_item");
    expect(res.ok).toBe(false);
    expect(await eco.getBalance(id)).toBe(10);
    expect(await dbs.db.select().from(inventory).where(eq(inventory.userId, id))).toHaveLength(0);
  });

  test("deux achats d'objets différents au même solde : un seul passe, rien n'est perdu", async () => {
    const id = "eco-lim-race";
    await freshUser(id, { zeni: 300 });
    await dbs.db
      .insert(shopItems)
      .values([
        { key: "eco_lim_item2", type: "title", name: "Titre", price: 300, enabled: true },
        { key: "eco_lim_item3", type: "color", name: "Couleur", price: 300, enabled: true },
      ])
      .onConflictDoNothing();
    const [a, b] = await Promise.all([
      eco.purchase(id, "eco_lim_item2"),
      eco.purchase(id, "eco_lim_item3"),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await eco.getBalance(id)).toBe(0);
    expect(await dbs.db.select().from(inventory).where(eq(inventory.userId, id))).toHaveLength(1);
  });
});

describe("grand livre", () => {
  test("un grand livre en panne ne fait pas échouer un crédit déjà appliqué", async () => {
    const id = "eco-lim-ledger";
    await freshUser(id, { zeni: 0 });
    dbs.sqlite.exec("ALTER TABLE action_logs RENAME TO action_logs_off");
    try {
      await expect(
        eco.addZeni(id, 40, { propagateFusion: false, source: "daily", applyRace: false }),
      ).resolves.toBeUndefined();
    } finally {
      dbs.sqlite.exec("ALTER TABLE action_logs_off RENAME TO action_logs");
    }
    expect(await eco.getBalance(id)).toBe(40);
  });
});

describe("zéni de palier", () => {
  test("un gain d'XP qui traverse deux paliers verse deux fois zeni.per_level", async () => {
    const id = "eco-lim-levels";
    await freshUser(id, { zeni: 0 });
    // Default curve: level 1 at 1,000 XP, level 2 at 5,000 XP.
    const res = await levels.addXP(id, 6_000, { propagateFusion: false, source: "admin" });
    expect(res).toMatchObject({ oldLevel: 0, newLevel: 2, levelUp: true });
    expect(await eco.getBalance(id)).toBe(2_000);
  });
});
