/**
 * XP gain caps and the XP_SPIKE flag (incident of 2026-10-22/23).
 *
 * - the old fixed 5 M threshold raised 3,750 flags in 48 h on normal gains (message <= 500,
 *   voice 10,000/min, multiplier cap x100,000);
 * - a flag repeated on every message opened a row, an alert and a URSAF notice per message;
 * - a "high" spike had no effect (freeze: false).
 */
import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { actionLogs, economyFlags, guildSettings, users } from "~/db/schema";
import { XpRateWindow, singleGainCeiling, xpGainLimits, loadXpGainLimits } from "~/lib/xp-boosts";

const { LevelService } = await import("~/services/LevelService");
const { SettingsService } = await import("~/services/SettingsService");
const { AntiCheatService } = await import("~/services/AntiCheatService");

const dbs = container.resolve(DatabaseService);
const levels = container.resolve(LevelService);
const settings = container.resolve(SettingsService);
container.resolve(AntiCheatService); // crée economy_flags

async function setSetting(key: string, value: string | null) {
  if (value === null) await dbs.db.delete(guildSettings).where(eq(guildSettings.key, key));
  else {
    await dbs.db
      .insert(guildSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: guildSettings.key, set: { value } });
  }
  settings.invalidate();
}

async function freshUser(id: string, values: Partial<typeof users.$inferInsert> = {}) {
  await dbs.db.delete(users).where(eq(users.id, id));
  await dbs.db.insert(users).values({ id, ...values });
}

const flagsOf = (userId: string, code: string) =>
  dbs.db
    .select()
    .from(economyFlags)
    .where(and(eq(economyFlags.userId, userId), eq(economyFlags.code, code)));

// Production configuration read on 2026-10-23.
const PROD = {
  messageMax: 500,
  messageCooldownMs: 60_000,
  regenXp: 0,
  voicePerTick: 10_000,
  maxMultiplier: 100_000,
  fusionRatio: 0.1,
};

describe("plafonds dérivés de la configuration", () => {
  test("les gains observés en production (15 M message, 400 M vocal) sont sous les plafonds", () => {
    const limits = xpGainLimits(PROD);
    expect(limits.message).toBe(50_000_000);
    expect(limits.voice).toBe(1_000_000_000);
    expect(singleGainCeiling(limits, "message")).toBeGreaterThan(15_040_000);
    expect(singleGainCeiling(limits, "voice")).toBeGreaterThan(400_000_000);
    // L'ancien seuil fixe aurait signalé les deux.
    expect(15_040_000).toBeGreaterThan(5_000_000);
  });

  test("avec les réglages par défaut le plafond reste petit", () => {
    const limits = xpGainLimits({ ...PROD, messageMax: 25, voicePerTick: 20, maxMultiplier: 10 });
    expect(limits.message).toBe(250);
    expect(limits.voice).toBe(200);
    expect(limits.perMinute).toBeLessThan(2_000);
  });

  test("l'admin n'a pas de plafond, les autres sources prennent le plus grand", () => {
    const limits = xpGainLimits(PROD);
    expect(singleGainCeiling(limits, "admin")).toBe(Number.POSITIVE_INFINITY);
    expect(singleGainCeiling(limits, "fusion")).toBe(limits.voice);
    expect(singleGainCeiling(limits, "other")).toBe(limits.voice);
  });

  test("les réglages manuels ne font que resserrer", async () => {
    await setSetting("xp.gain.max_single", "123");
    const tight = await loadXpGainLimits(settings);
    expect(tight.message).toBe(123);
    expect(tight.voice).toBe(123);
    await setSetting("xp.gain.max_single", "999999999999");
    const loose = await loadXpGainLimits(settings);
    expect(loose.message).toBeLessThan(999_999_999_999);
    await setSetting("xp.gain.max_single", null);
  });
});

describe("XpRateWindow", () => {
  test("n'accorde pas plus que le plafond sur la fenêtre, puis libère", () => {
    const w = new XpRateWindow(60_000);
    expect(w.take("u", 70, 100, 0)).toBe(70);
    expect(w.take("u", 70, 100, 10_000)).toBe(30);
    expect(w.take("u", 10, 100, 20_000)).toBe(0);
    expect(w.take("u", 50, 100, 61_000)).toBe(50);
    expect(w.take("other", 100, 100, 20_000)).toBe(100);
  });
});

describe("addXP — plafond par gain", () => {
  test("un gain normal n'est ni écrêté ni signalé, même au-dessus de 5 M", async () => {
    const id = "lim-normal";
    await freshUser(id);
    await setSetting("xp.message.max", "500");
    await setSetting("xp.multiplier.max", "100000");
    const res = await levels.addXP(id, 15_040_000, { propagateFusion: false, source: "message" });
    expect(res.granted).toBe(15_040_000);
    expect((await levels.findUser(id))?.xp).toBe(15_040_000);
    expect(await flagsOf(id, "XP_SPIKE")).toHaveLength(0);
  });

  test("un gain au-dessus du plafond est écrêté, signalé une seule fois, jamais une par message", async () => {
    const id = "lim-spike";
    await freshUser(id);
    await setSetting("xp.gain.max_single", "1000");
    await setSetting("xp.gain.max_per_minute", null);
    for (let i = 0; i < 5; i++) {
      const res = await levels.addXP(id, 5_000, { propagateFusion: false, source: "message" });
      expect(res.granted).toBeLessThanOrEqual(1_000);
    }
    const flags = await flagsOf(id, "XP_SPIKE");
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ severity: "medium", status: "open" });
    expect(JSON.parse(flags[0]!.meta!)).toMatchObject({ amount: 5_000, threshold: 1_000 });
    expect(JSON.parse(flags[0]!.meta!).occurrences).toBe(5);
    expect((await levels.findUser(id))?.zeniFrozen).toBe(false);
    await setSetting("xp.gain.max_single", null);
  });

  test("un pic très au-dessus du plafond gèle le compte : plus de gain tant qu'il est gelé", async () => {
    const id = "lim-freeze";
    await freshUser(id);
    await setSetting("xp.gain.max_single", "1000");
    const res = await levels.addXP(id, 50_000, { propagateFusion: false, source: "message" });
    expect(res.granted).toBe(1_000);
    const [flag] = await flagsOf(id, "XP_SPIKE");
    expect(flag?.severity).toBe("high");
    expect((await levels.findUser(id))?.zeniFrozen).toBe(true);

    const blocked = await levels.addXP(id, 10, { propagateFusion: false, source: "message" });
    expect(blocked).toMatchObject({ blocked: "frozen", granted: 0 });
    expect((await levels.findUser(id))?.xp).toBe(1_000);

    // L'admin n'est jamais bloqué ni écrêté ni signalé.
    const admin = await levels.addXP(id, 500_000, { propagateFusion: false, source: "admin" });
    expect(admin.granted).toBe(500_000);
    expect(await flagsOf(id, "XP_SPIKE")).toHaveLength(1);
    await setSetting("xp.gain.max_single", null);
  });
});

describe("addXP — plafond par minute", () => {
  test("au-delà du plafond sur 60 s, le surplus n'est pas accordé et un XP_RATE est ouvert", async () => {
    const id = "lim-rate";
    await freshUser(id);
    await setSetting("xp.gain.max_single", null);
    await setSetting("xp.gain.max_per_minute", "300");
    const a = await levels.addXP(id, 200, { propagateFusion: false, source: "message" });
    const b = await levels.addXP(id, 200, { propagateFusion: false, source: "message" });
    const c = await levels.addXP(id, 200, { propagateFusion: false, source: "message" });
    expect([a.granted, b.granted, c.granted]).toEqual([200, 100, 0]);
    expect((await levels.findUser(id))?.xp).toBe(300);
    expect(await flagsOf(id, "XP_RATE")).toHaveLength(1);
    await setSetting("xp.gain.max_per_minute", null);
  });
});

describe("addXP — écritures", () => {
  test("la part de fusion se calcule sur l'XP accordée, pas sur le montant demandé", async () => {
    const [a, b] = ["lim-fuse-a", "lim-fuse-b"];
    await freshUser(a);
    await freshUser(b);
    const { fusions } = await import("~/db/schema");
    await dbs.db.delete(fusions);
    await dbs.db.insert(fusions).values({ userA: a, userB: b });
    await setSetting("xp.gain.max_single", "1000");
    const res = await levels.addXP(a, 1_000_000, { propagateFusion: true, source: "message" });
    expect(res.granted).toBe(1_000);
    expect(res.partnerBonus).toBe(100); // 10 % de 1 000, pas de 1 000 000
    expect((await levels.findUser(b))?.xp).toBe(100);
    await dbs.db.delete(fusions);
    await setSetting("xp.gain.max_single", null);
  });

  test("un utilisateur absent est créé et crédité d'un seul geste (upsert)", async () => {
    const id = "lim-upsert";
    await dbs.db.delete(users).where(eq(users.id, id));
    const results = await Promise.all([
      levels.addXP(id, 7, { propagateFusion: false, source: "admin" }),
      levels.addXP(id, 7, { propagateFusion: false, source: "admin" }),
    ]);
    expect(results.map((r) => r.granted)).toEqual([7, 7]);
    expect((await levels.findUser(id))?.xp).toBe(14);
  });

  test("l'échec du grand livre n'annule pas le gain ni l'annonce du niveau", async () => {
    const id = "lim-ledger";
    await freshUser(id);
    dbs.sqlite.exec("ALTER TABLE action_logs RENAME TO action_logs_off");
    try {
      const res = await levels.addXP(id, 2_000, { propagateFusion: false, source: "admin" });
      expect(res.after).toBe(2_000);
      expect(res.levelUp).toBe(true);
    } finally {
      dbs.sqlite.exec("ALTER TABLE action_logs_off RENAME TO action_logs");
    }
    expect((await levels.findUser(id))?.xp).toBe(2_000);
  });

  test("setXP ramène le montant à un entier sûr et journalise XP_SET", async () => {
    const id = "lim-setxp";
    await freshUser(id, { xp: 50 });
    const huge = await levels.setXP(id, 1e300);
    expect(huge.after).toBe(Number.MAX_SAFE_INTEGER);
    const neg = await levels.setXP(id, -40);
    expect(neg).toMatchObject({ after: 0, newLevel: 0 });
    const logs = await dbs.db.select().from(actionLogs).where(eq(actionLogs.userId, id));
    expect(logs.filter((l) => l.action === "XP_SET")).toHaveLength(2);
  });
});
