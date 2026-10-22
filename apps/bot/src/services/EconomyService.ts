import { container, singleton, inject } from "tsyringe";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import type { GuildMember } from "discord.js";
import { DatabaseService } from "~/db/index";
import { users, inventory, shopItems, fusions, achievements, actionLogs } from "~/db/schema";
import { FUSION_XP_BONUS_RATIO, FUSION_ZENI_BONUS_RATIO } from "~/lib/constants";
import { logger } from "~/lib/logger";
import { applyZeniRace } from "~/lib/races";
import { SettingsService } from "~/services/SettingsService";
import { AntiCheatService, type ZeniSource } from "~/services/AntiCheatService";
import { InflationService } from "~/services/InflationService";

/** Emplacements cosmétiques du profil. */
export type CosmeticType = "card" | "badge" | "color" | "title" | "banner";

/** Colonne `users` de l'objet équipé, par emplacement. */
export const EQUIPPED_FIELD = {
  card: "equippedCard",
  badge: "equippedBadge",
  color: "equippedColor",
  title: "equippedTitle",
  banner: "equippedBanner",
} as const satisfies Record<CosmeticType, keyof typeof users.$inferSelect>;

/** Emplacements dont l'objet peut porter un rôle Discord, posé à l'équipement. */
export const ROLE_COSMETICS: ReadonlySet<CosmeticType> = new Set(["color", "title", "badge"]);

/** Carte de profil par défaut : équipable sans la posséder. */
export function isDefaultCard(type: CosmeticType, key: string): boolean {
  return type === "card" && (key === "default" || key === "card_default");
}

@singleton()
export class EconomyService {
  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(SettingsService) private settings: SettingsService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  async ensureUser(userId: string) {
    await this.db.insert(users).values({ id: userId }).onConflictDoNothing();
  }

  async getBalance(userId: string): Promise<number> {
    await this.ensureUser(userId);
    const u = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    return u?.zeni ?? 0;
  }

  /**
   * Crédite des zénis. Point de passage UNIQUE de tous les gains, pour trois
   * raisons qui n'existaient pas quand chaque source écrivait `users.zeni`
   * elle-même :
   *  - un compte gelé par l'anti-triche ne reçoit plus rien (hors admin et
   *    restitution de mise) — le gel n'était vérifié nulle part ;
   *  - chaque gain passe à l'anti-triche (`AntiCheatService.inspect` n'avait
   *    aucun appelant) ;
   *  - l'incrément est atomique (`zeni + n`) : les sources qui écrivaient
   *    `user.zeni + n` depuis une lecture antérieure écrasaient les gains
   *    concurrents.
   */
  async addZeni(
    userId: string,
    amount: number,
    options: {
      propagateFusion?: boolean;
      kind?: "game" | "stake" | "other";
      /** Provenance du gain, pour l'anti-triche et le grand livre. */
      source?: ZeniSource;
      /** `false` quand l'appelant a déjà appliqué le multiplicateur de race. */
      applyRace?: boolean;
    } = {
      propagateFusion: true,
    },
  ): Promise<number | undefined> {
    await this.ensureUser(userId);
    if (!Number.isFinite(amount)) throw new Error("Montant de zénis invalide.");
    amount = Math.trunc(amount);
    const isStake = options.kind === "stake";
    const source: ZeniSource = options.source ?? (options.kind === "game" ? "game" : "other");
    // `stake` = restitution d'une mise séquestrée : un transfert entre joueurs,
    // pas un gain. Aucun multiplicateur (sinon une mise de 1 M rapportait
    // 1,5 M à un Majin pour 1 M risqué) et aucune part de fusion.
    if (isStake) options = { ...options, propagateFusion: false };

    const u =
      amount > 0 ? await this.db.query.users.findFirst({ where: eq(users.id, userId) }) : null;
    if (amount > 0 && !isStake && source !== "admin" && u?.zeniFrozen) {
      await this.db.insert(actionLogs).values({
        userId,
        action: "ZENI_BLOCKED",
        reason: "Gains gelés par l'anti-triche",
        meta: JSON.stringify({ amount, source, kind: options.kind ?? "other" }),
      });
      return undefined;
    }
    // Multiplicateur de RACE : Terrien +25 % (général), Majin +50 % sur les jeux.
    if (amount > 0 && !isStake && options.applyRace !== false) {
      amount = applyZeniRace(u?.race, amount, options.kind === "game");
    }
    const [after] = await this.db
      .update(users)
      .set({ zeni: sql`${users.zeni} + ${amount}`, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ zeni: users.zeni });
    if (amount > 0) {
      await this.db.insert(actionLogs).values({
        userId,
        action: "ZENI_GAIN",
        meta: JSON.stringify({ amount, kind: options.kind ?? "other", source }),
      });
      if (!isStake && source !== "admin") {
        await container.resolve(AntiCheatService).inspect({
          userId,
          amount,
          balanceAfter: Number(after?.zeni ?? 0),
          source,
          detail: options.kind,
        });
      }
    }

    if (options.propagateFusion && amount > 0) {
      const partner = await this.partnerOf(userId);
      if (partner) {
        const { zeni: ratio } = await this.fusionRatios();
        const bonus = Math.floor(amount * ratio);
        if (bonus > 0) {
          await this.addZeni(partner, bonus, { propagateFusion: false, source: "fusion" });
          return bonus;
        }
      }
    }
    return undefined;
  }

  async removeZeni(userId: string, amount: number): Promise<boolean> {
    await this.ensureUser(userId);
    if (!Number.isFinite(amount) || amount < 0) return false;
    amount = Math.trunc(amount);
    if (amount === 0) return true;
    // Débit conditionnel ATOMIQUE : la lecture puis l'écriture séparées
    // laissaient deux débits concurrents passer sur le même solde et le
    // rendre négatif (double-clic sur « Acheter », deux mises simultanées).
    const rows = await this.db
      .update(users)
      .set({ zeni: sql`${users.zeni} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(users.id, userId), gte(users.zeni, amount)))
      .returning({ id: users.id });
    return rows.length > 0;
  }

  /**
   * Débite au plus `amount` sans passer sous zéro et renvoie le montant
   * réellement retiré. Lecture et écriture synchrones, sans `await` entre
   * elles : aucun autre mouvement ne peut s'intercaler.
   */
  async removeZeniUpTo(userId: string, amount: number): Promise<number> {
    await this.ensureUser(userId);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const row = this.db.select({ zeni: users.zeni }).from(users).where(eq(users.id, userId)).get();
    const removed = Math.min(Math.trunc(amount), Math.max(0, row?.zeni ?? 0));
    if (removed > 0) {
      this.db
        .update(users)
        .set({ zeni: sql`${users.zeni} - ${removed}`, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .run();
    }
    return removed;
  }

  async setZeni(userId: string, amount: number) {
    await this.ensureUser(userId);
    if (!Number.isFinite(amount)) throw new Error("Montant de zénis invalide.");
    await this.db
      .update(users)
      .set({ zeni: Math.max(0, Math.trunc(amount)), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /** Parts versées au partenaire de fusion (`xp.fusion.bonus_ratio`, `zeni.fusion.bonus_ratio`). */
  async fusionRatios(): Promise<{ xp: number; zeni: number }> {
    return {
      xp: await this.settings.getFloat("xp.fusion.bonus_ratio", FUSION_XP_BONUS_RATIO),
      zeni: await this.settings.getFloat("zeni.fusion.bonus_ratio", FUSION_ZENI_BONUS_RATIO),
    };
  }

  /** Prix affiché et facturé d'un article : indexé sur l'inflation quand elle est active. */
  async priceOf(basePrice: number): Promise<number> {
    return container.resolve(InflationService).priceOf(basePrice);
  }

  // Shop
  async listShop(type?: CosmeticType) {
    if (type) {
      return this.db
        .select()
        .from(shopItems)
        .where(and(eq(shopItems.enabled, true), eq(shopItems.type, type)));
    }
    return this.db.select().from(shopItems).where(eq(shopItems.enabled, true));
  }

  async getShopItem(key: string) {
    return this.db.query.shopItems.findFirst({ where: eq(shopItems.key, key) });
  }

  async setShopItemRole(key: string, roleId: string | null): Promise<boolean> {
    const exists = await this.getShopItem(key);
    if (!exists) return false;
    await this.db.update(shopItems).set({ roleId }).where(eq(shopItems.key, key));
    return true;
  }

  async upsertShopItem(item: {
    key: string;
    type: CosmeticType;
    name: string;
    description?: string | null;
    price: number;
    roleId?: string | null;
    enabled?: boolean;
  }) {
    await this.db
      .insert(shopItems)
      .values({
        key: item.key,
        type: item.type,
        name: item.name,
        description: item.description ?? null,
        price: item.price,
        roleId: item.roleId ?? null,
        enabled: item.enabled ?? true,
      })
      .onConflictDoUpdate({
        target: shopItems.key,
        set: {
          type: item.type,
          name: item.name,
          description: item.description ?? null,
          price: item.price,
          roleId: item.roleId ?? null,
          enabled: item.enabled ?? true,
        },
      });
  }

  async grantItem(userId: string, type: CosmeticType, key: string) {
    await this.ensureUser(userId);
    await this.db
      .insert(inventory)
      .values({ userId, itemType: type, itemKey: key })
      .onConflictDoNothing();
  }

  async removeItem(userId: string, type: CosmeticType, key: string) {
    await this.db
      .delete(inventory)
      .where(
        and(eq(inventory.userId, userId), eq(inventory.itemType, type), eq(inventory.itemKey, key)),
      );
  }

  async ownsItem(userId: string, type: CosmeticType, key: string): Promise<boolean> {
    const row = await this.db.query.inventory.findFirst({
      where: and(
        eq(inventory.userId, userId),
        eq(inventory.itemType, type),
        eq(inventory.itemKey, key),
      ),
    });
    return !!row;
  }

  async purchase(
    userId: string,
    itemKey: string,
  ): Promise<{
    ok: boolean;
    reason?: string;
    price?: number;
    roleId?: string | null;
    name?: string;
    type?: CosmeticType;
  }> {
    const item = await this.getShopItem(itemKey);
    if (!item || !item.enabled) return { ok: false, reason: "Objet introuvable" };
    if (await this.ownsItem(userId, item.type, item.key))
      return { ok: false, reason: "Déjà possédé" };

    const price = await this.priceOf(item.price);
    const balance = await this.getBalance(userId);
    if (balance < price) {
      const fmt = (n: number) => n.toLocaleString("fr-FR");
      return { ok: false, reason: `Solde insuffisant (${fmt(balance)} / ${fmt(price)} zénis)` };
    }

    const removed = await this.removeZeni(userId, price);
    if (!removed) return { ok: false, reason: "Solde insuffisant" };

    // Deux achats simultanés (double-clic) passaient tous deux le contrôle
    // « déjà possédé » : le second débit avait lieu, puis l'insertion levait la
    // contrainte unique et les zénis étaient perdus. Le doublon est remboursé.
    const granted = await this.db
      .insert(inventory)
      .values({ userId, itemType: item.type, itemKey: item.key })
      .onConflictDoNothing()
      .returning({ id: inventory.id });
    if (granted.length === 0) {
      await this.db
        .update(users)
        .set({ zeni: sql`${users.zeni} + ${price}`, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { ok: false, reason: "Déjà possédé" };
    }
    await this.db.insert(actionLogs).values({
      userId,
      action: "SHOP_PURCHASE",
      meta: JSON.stringify({ item: item.key, price, basePrice: item.price }),
    });
    return { ok: true, price, roleId: item.roleId, name: item.name, type: item.type };
  }

  async listInventory(userId: string) {
    return this.db.select().from(inventory).where(eq(inventory.userId, userId));
  }

  async getUser(userId: string) {
    return this.db.query.users.findFirst({ where: eq(users.id, userId) });
  }

  async setEquipped(userId: string, type: CosmeticType, key: string | null) {
    await this.ensureUser(userId);
    await this.db
      .update(users)
      .set({ [EQUIPPED_FIELD[type]]: key, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /** Clé équipée sur un emplacement, `null` si rien. */
  async equippedKey(userId: string, type: CosmeticType): Promise<string | null> {
    const user = await this.getUser(userId);
    return user?.[EQUIPPED_FIELD[type]] ?? null;
  }

  /**
   * Retire l'objet équipé d'un emplacement et renvoie sa clé (`null` si rien
   * n'était équipé). Sans cette méthode, un objet équipé ne pouvait être que
   * REMPLACÉ : un membre qui équipait une bannière n'avait plus aucun moyen de
   * revenir à sa carte par défaut.
   */
  async unequip(userId: string, type: CosmeticType): Promise<string | null> {
    const previous = await this.equippedKey(userId, type);
    await this.setEquipped(userId, type, null);
    return previous;
  }

  async equip(userId: string, type: CosmeticType, key: string): Promise<boolean> {
    if (!isDefaultCard(type, key) && !(await this.ownsItem(userId, type, key))) return false;
    await this.setEquipped(userId, type, key);
    return true;
  }

  /** Rôle Discord lié à l'objet `key` de cet emplacement, `null` sinon. */
  async cosmeticRoleId(type: CosmeticType, key: string | null): Promise<string | null> {
    if (!key || !ROLE_COSMETICS.has(type)) return null;
    const item = await this.getShopItem(key);
    return item && item.type === type ? (item.roleId ?? null) : null;
  }

  /**
   * Équipe un objet et aligne les rôles Discord du membre : le rôle de l'ancien
   * objet du même emplacement est retiré (changer de couleur empilait les rôles
   * de couleur), celui du nouveau est posé. Un échec de rôle (hiérarchie,
   * permission) n'annule pas l'équipement.
   */
  async equipCosmetic(
    member: GuildMember,
    type: CosmeticType,
    key: string,
  ): Promise<{ ok: boolean; previous: string | null; roleGranted: boolean }> {
    const previous = await this.equippedKey(member.id, type);
    if (!(await this.equip(member.id, type, key))) {
      return { ok: false, previous, roleGranted: false };
    }
    const [oldRole, newRole] = await Promise.all([
      previous !== key ? this.cosmeticRoleId(type, previous) : Promise.resolve(null),
      this.cosmeticRoleId(type, key),
    ]);
    if (oldRole && oldRole !== newRole && member.roles.cache.has(oldRole)) {
      await member.roles
        .remove(oldRole, `Équipement ${type} remplacé`)
        .catch((err) => logger.warn({ err, roleId: oldRole }, "cosmetic role removal failed"));
    }
    let roleGranted = false;
    if (newRole) {
      roleGranted = await member.roles
        .add(newRole, `Équipement ${type}:${key}`)
        .then(() => true)
        .catch((err) => {
          logger.warn({ err, roleId: newRole }, "cosmetic role grant failed");
          return false;
        });
    }
    return { ok: true, previous, roleGranted };
  }

  /** Déséquipe un emplacement et retire le rôle Discord de l'objet retiré. */
  async unequipCosmetic(
    member: GuildMember,
    type: CosmeticType,
  ): Promise<{ previous: string | null; roleRemoved: boolean }> {
    const previous = await this.unequip(member.id, type);
    const roleId = await this.cosmeticRoleId(type, previous);
    if (!roleId || !member.roles.cache.has(roleId)) return { previous, roleRemoved: false };
    const roleRemoved = await member.roles
      .remove(roleId, `Équipement ${type} retiré`)
      .then(() => true)
      .catch(() => false);
    return { previous, roleRemoved };
  }

  // Fusion
  async getFusion(userId: string) {
    return this.db.query.fusions.findFirst({
      where: (f, { or, eq: e }) => or(e(f.userA, userId), e(f.userB, userId)),
    });
  }

  async partnerOf(userId: string): Promise<string | null> {
    const f = await this.getFusion(userId);
    if (!f) return null;
    return f.userA === userId ? f.userB : f.userA;
  }

  /**
   * Scelle une fusion si aucun des deux membres n'est déjà fusionné. Le
   * contrôle et l'insertion sont synchrones : deux acceptations simultanées
   * (A accepte B pendant que B accepte C) ne créent plus deux unions pour B.
   */
  async createFusion(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const [userA, userB] = [a, b].toSorted();
    const taken = this.db
      .select({ id: fusions.id })
      .from(fusions)
      .where(
        sql`${fusions.userA} IN (${userA}, ${userB}) OR ${fusions.userB} IN (${userA}, ${userB})`,
      )
      .get();
    if (taken) return false;
    const rows = this.db
      .insert(fusions)
      .values({ userA: userA!, userB: userB! })
      .onConflictDoNothing()
      .returning({ id: fusions.id })
      .all();
    return rows.length > 0;
  }

  async breakFusion(userId: string) {
    const f = await this.getFusion(userId);
    if (!f) return false;
    await this.db.delete(fusions).where(eq(fusions.id, f.id));
    return true;
  }

  async listAllFusions() {
    return this.db.select().from(fusions);
  }

  // Succès
  async grantAchievement(userId: string, code: string): Promise<boolean> {
    await this.ensureUser(userId);
    const rows = await this.db
      .insert(achievements)
      .values({ userId, code })
      .onConflictDoNothing()
      .returning({ id: achievements.id });
    return rows.length > 0; // false : déjà attribué
  }

  async revokeAchievement(userId: string, code: string) {
    await this.db
      .delete(achievements)
      .where(and(eq(achievements.userId, userId), eq(achievements.code, code)));
  }

  async listAchievements(userId: string) {
    return this.db.select().from(achievements).where(eq(achievements.userId, userId));
  }

  // Classements
  async topRich(limit = 10) {
    return this.db.select().from(users).orderBy(desc(users.zeni)).limit(limit);
  }

  async listRegisteredIds(): Promise<string[]> {
    const rows = await this.db.select({ id: users.id }).from(users);
    return rows.map((r) => r.id);
  }
}
