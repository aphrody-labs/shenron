import { container, singleton, inject } from "tsyringe";
import { and, asc, desc, eq, lt, lte, or, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Guild, GuildMember, TextBasedChannel } from "discord.js";
import { DatabaseService } from "~/db/index";
import { users, levelRewards, actionLogs, fusions } from "~/db/schema";
import { ZENI_PER_LEVEL, FUSION_XP_BONUS_RATIO } from "~/lib/constants";
import { XP_MAX, getLevelThresholds, levelFromXp, sanitizeXp } from "~/lib/xp";
import { applyZeniRace, hasZenkai, type RaceId } from "~/lib/races";
import {
  DEFAULT_XP_BOOST_CONFIG,
  XpRateWindow,
  loadXpGainLimits,
  singleGainCeiling,
  type XpGainLimits,
} from "~/lib/xp-boosts";
import {
  DEFAULT_LEVEL_RACE,
  hasRaceLadder,
  memberRaceId,
  planTierRoles,
  raceLevelRoleAt,
  raceLevelRoleIds,
  type TierPlan,
} from "~/lib/race-levels";
import { levelUpMessage } from "~/lib/dbz-flavor";
import { levelUpEmbed } from "~/lib/embeds";
import { logger } from "~/lib/logger";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { SettingsService } from "~/services/SettingsService";
import { AntiCheatService } from "~/services/AntiCheatService";
import { EconomyService } from "~/services/EconomyService";

/**
 * Single ordering of every ranking: value descending, then id ascending. Without the
 * second key, ties changed places from one query to the next (duplicated or skipped
 * pages) and the /profil rank, computed as "strictly greater", did not match the position
 * shown by /top.
 */
export function rankOrdering(column: SQLiteColumn) {
  return [desc(column), asc(users.id)] as const;
}

/**
 * Members who left the guild, and bots, are not ranked. The `discord_members` mirror is
 * reliable only after a full sync, so the rule is one-sided: a user is hidden when the mirror
 * has a row that says `present = 0` or `bot = 1`; a user the mirror does not know stays.
 * `userId` is the column holding the Discord id in the query (`users.id`, `actionLogs.userId`).
 * Raw SQL: the mirror tables are managed by the guild mirror, not by the Drizzle schema.
 */
export function rankedMembersOnly(userId: SQLiteColumn) {
  return sql`not exists (select 1 from discord_members dm where dm.user_id = ${userId} and (dm.present = 0 or dm.bot = 1))`;
}

/** Above this share of members to strip, the pass assumes a wrong database and removes nothing. */
const MAX_STRIP_SHARE = 0.5;
/** Maximum number of level-up zeni payments for a single XP gain. */
const MAX_LEVELS_PAID = 50;

/** What {@link LevelService.syncRaceLevelRoles} is allowed to remove. */
export type TierRemoval = "none" | "foreign" | "all";

export interface TierSyncResult {
  skipped?: "no-user" | "no-ladder";
  level: number;
  race: RaceId;
  plan: TierPlan;
  /** Roles granted. */
  added: string[];
  /** Roles removed (empty in report-only mode). */
  removed: string[];
  /** Removal refused: the row exists but its XP is zero (empty or restored database). */
  suspect: boolean;
}

export interface TierReconcileStats {
  scanned: number;
  synced: number;
  failed: number;
  /** Members holding tiers above their level or from another race. */
  excessMembers: number;
  excessRoles: number;
  removedRoles: number;
  /** `apply`: the excess was removed; `report`: observed only. */
  mode: "apply" | "report";
  /** Removal requested but refused: too many members affected, the database is suspect. */
  aborted?: "share";
  sample: Array<{ userId: string; above: string[]; foreign: string[] }>;
}

type GainOutcome = {
  before: number;
  after: number;
  granted: number;
  blocked: "frozen" | null;
  clip: "single" | "rate" | null;
  race: string | null;
};

@singleton()
export class LevelService {
  /** Gains received over the last 60 seconds, per member (per-minute cap). */
  private readonly gains = new XpRateWindow();

  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(MessageTemplateService) private templates: MessageTemplateService,
    @inject(SettingsService) private settings: SettingsService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  /** Creates the row when missing (idempotent). A failure is logged, then rethrown. */
  async ensureUser(userId: string) {
    try {
      await this.db.insert(users).values({ id: userId }).onConflictDoNothing();
    } catch (err) {
      logger.error({ err, userId }, "users upsert failed — XP and zeni writes will be lost");
      throw err;
    }
  }

  async getUser(userId: string) {
    await this.ensureUser(userId);
    return this.db.query.users.findFirst({ where: eq(users.id, userId) });
  }

  /** Ligne `users` existante, sans la créer (`undefined` si absente). */
  async findUser(userId: string) {
    return this.db.query.users.findFirst({ where: eq(users.id, userId) });
  }

  /**
   * Cumule du temps passé en vocal (`total_voice_ms`) — alimente le classement
   * « vocal » et les stats de profil. Personne ne l'écrivait : la colonne
   * restait à 0 pour tout le monde et le classement vocal était plat.
   */
  async addVoiceTime(userId: string, ms: number, sessionStartedAt?: Date) {
    if (ms <= 0) return;
    await this.ensureUser(userId);
    await this.db
      .update(users)
      .set({
        totalVoiceMs: sql`${users.totalVoiceMs} + ${ms}`,
        ...(sessionStartedAt ? { lastVoiceJoinAt: sessionStartedAt } : {}),
      })
      .where(eq(users.id, userId));
  }

  async addXP(
    userId: string,
    amount: number,
    options: {
      propagateFusion?: boolean;
      /** Origin of the gain: `admin` bypasses the caps, the freeze and the spike flag. */
      source?: "message" | "voice" | "game" | "fusion" | "admin" | "other";
    } = { propagateFusion: true },
  ): Promise<{
    before: number;
    after: number;
    levelUp: boolean;
    oldLevel: number;
    newLevel: number;
    /** XP actually added (capped, or 0 when the account is frozen). */
    granted: number;
    /** Zeni actually credited for the levels crossed (`zeni.per_level` each), 0 when none. */
    levelZeni: number;
    blocked?: "frozen";
    partnerBonus?: number;
  }> {
    // Incident du 2026-09-11 : un octroi de 8,5 × 10²⁴ XP (au-delà de ce
    // qu'un entier JavaScript représente exactement) est passé sans contrôle,
    // et sa part de fusion avec lui. Un montant doit être un nombre fini, et
    // le solde reste dans les entiers sûrs.
    if (!Number.isFinite(amount)) throw new Error("Montant d'XP invalide.");
    const source = options.source ?? "other";
    const requested = Math.trunc(amount);
    // The caps follow the active configuration (message, voice, multiplier cap); a gain above
    // them cannot come from the game.
    const limits =
      source !== "admin" && requested > 0 ? await loadXpGainLimits(this.settings) : null;
    const ceiling = limits ? singleGainCeiling(limits, source) : Number.POSITIVE_INFINITY;

    // A single synchronous transaction with no `await` inside: read, caps and write leave no
    // room for a concurrent gain (simultaneous message, voice and fusion share used to
    // overwrite each other when `xp = read + n` came from a stale read).
    let outcome: GainOutcome;
    try {
      outcome = this.db.transaction(
        (tx): GainOutcome => {
          tx.insert(users).values({ id: userId }).onConflictDoNothing().run();
          const row = tx.select().from(users).where(eq(users.id, userId)).get();
          if (!row) throw new Error("users row missing right after upsert");
          const before = row.xp;
          if (limits && row.zeniFrozen) {
            return {
              before,
              after: before,
              granted: 0,
              blocked: "frozen",
              clip: null,
              race: row.race,
            };
          }
          let want = requested;
          let clip: GainOutcome["clip"] = null;
          if (limits) {
            if (want > ceiling) {
              want = ceiling;
              clip = "single";
            }
            const allowed = this.gains.take(userId, want, limits.perMinute);
            if (allowed < want) {
              want = allowed;
              clip ??= "rate";
            }
          }
          const after = Math.min(XP_MAX, Math.max(0, before + want));
          tx.update(users)
            .set({ xp: after, lastLevelReached: levelFromXp(after), updatedAt: new Date() })
            .where(eq(users.id, userId))
            .run();
          return { before, after, granted: after - before, blocked: null, clip, race: row.race };
        },
        { behavior: "immediate" },
      );
    } catch (err) {
      logger.error({ err, userId, amount: requested, source }, "XP write failed");
      throw err;
    }

    const { before, after, granted, race } = outcome;
    const oldLevel = levelFromXp(before);
    const newLevel = levelFromXp(after);
    const levelUp = newLevel > oldLevel;

    if (outcome.blocked) {
      logger.debug({ userId, amount: requested, source }, "XP gain refused: account frozen");
      return {
        before,
        after,
        levelUp: false,
        oldLevel,
        newLevel,
        granted: 0,
        levelZeni: 0,
        blocked: "frozen",
      };
    }

    // The ledger feeds the audit and the monthly top: its failure must neither cancel an
    // already written gain nor prevent the level announcement, but it must be visible.
    try {
      if (granted !== 0 || outcome.clip)
        await this.db.insert(actionLogs).values({
          userId,
          action: "XP_GAIN",
          meta: JSON.stringify({
            amount: granted,
            before,
            after,
            source,
            ...(outcome.clip ? { requested, clipped: outcome.clip } : {}),
          }),
        });
    } catch (err) {
      logger.error({ err, userId, source, amount: granted }, "XP_GAIN ledger write failed");
    }

    if (outcome.clip) await this.flagClippedGain(userId, source, requested, ceiling, limits);

    let levelZeni = 0;
    if (levelUp) {
      try {
        levelZeni = await this.payLevelUp(userId, race, before, after);
      } catch (err) {
        logger.error({ err, userId, newLevel }, "level-up zeni credit failed");
      }
    }

    // Fusion bonus: the partner receives a % with no back-propagation, computed on the XP
    // actually granted (never on the requested amount before capping).
    let partnerBonus: number | undefined;
    if (options.propagateFusion && granted > 0) {
      const partner = await this.partnerOf(userId);
      if (partner) {
        const ratio = await this.settings.getFloat("xp.fusion.bonus_ratio", FUSION_XP_BONUS_RATIO);
        partnerBonus = Math.floor(granted * ratio);
        if (partnerBonus > 0) {
          await this.addXP(partner, partnerBonus, { propagateFusion: false, source: "fusion" });
        }
      }
    }

    return { before, after, levelUp, oldLevel, newLevel, granted, levelZeni, partnerBonus };
  }

  /** Flags a clipped gain. A spike far above the ceiling freezes the account's gains. */
  private async flagClippedGain(
    userId: string,
    source: string,
    requested: number,
    ceiling: number,
    limits: XpGainLimits | null,
  ) {
    const anticheat = container.resolve(AntiCheatService);
    if (requested > ceiling) {
      const high = requested > ceiling * 10;
      await anticheat.flag(userId, {
        code: "XP_SPIKE",
        severity: high ? "high" : "medium",
        reason: `Gain d'XP au-dessus du plafond : +${requested} XP (plafond ${ceiling}) via ${source}`,
        meta: { amount: requested, threshold: ceiling, source },
        freeze: high,
      });
      return;
    }
    await anticheat.flag(userId, {
      code: "XP_RATE",
      severity: "medium",
      reason: `Plus de ${limits?.perMinute ?? 0} XP reçus en 60 s via ${source}`,
      meta: { amount: requested, perMinute: limits?.perMinute ?? 0, source },
    });
  }

  /**
   * Level-up zeni: `zeni.per_level` for EACH level crossed (a gain crossing several used to
   * pay only the first), paid level by level so the single-gain anti-cheat threshold never
   * sees a lumped sum. Zenkai opens once. Returns the zeni actually credited (a frozen account
   * receives nothing), which is what the level-up announcement shows.
   */
  private async payLevelUp(
    userId: string,
    race: string | null,
    before: number,
    after: number,
  ): Promise<number> {
    const crossed = Math.min(
      MAX_LEVELS_PAID,
      getLevelThresholds().filter((t) => t.xp > before && t.xp <= after).length,
    );
    const perLevel = applyZeniRace(
      race,
      await this.settings.getInt("zeni.per_level", ZENI_PER_LEVEL),
    );
    // Zenkai (Saiyan): opens an XP boost window after the level.
    if (hasZenkai(race)) {
      const minutes = await this.settings.getInt(
        "xp.zenkai.minutes",
        DEFAULT_XP_BOOST_CONFIG.zenkai.minutes,
      );
      await this.db
        .update(users)
        .set({ raceBoostUntil: new Date(Date.now() + Math.max(0, minutes) * 60_000) })
        .where(eq(users.id, userId));
    }
    // Through `addZeni`: freeze, anti-cheat and atomic increment. Race already applied.
    const economy = container.resolve(EconomyService);
    let credited = 0;
    for (let i = 0; i < crossed; i++) {
      credited += (
        await economy.creditZeni(userId, perLevel, { source: "level", applyRace: false })
      ).credited;
    }
    return credited;
  }

  async partnerOf(userId: string): Promise<string | null> {
    const f = await this.db.query.fusions.findFirst({
      where: or(eq(fusions.userA, userId), eq(fusions.userB, userId)),
    });
    if (!f) return null;
    return f.userA === userId ? f.userB : f.userA;
  }

  /**
   * Sets the XP (admin action). The amount is clamped to a safe integer >= 0: `1e300` or a
   * negative used to be written as is. The previous level comes from the previous XP, not
   * from the level cached in the row.
   */
  async setXP(
    userId: string,
    xp: number,
  ): Promise<{
    oldLevel: number;
    newLevel: number;
    levelUp: boolean;
    before: number;
    after: number;
  }> {
    const after = sanitizeXp(xp);
    let before = 0;
    try {
      before = this.db.transaction(
        (tx) => {
          tx.insert(users).values({ id: userId }).onConflictDoNothing().run();
          const row = tx.select({ xp: users.xp }).from(users).where(eq(users.id, userId)).get();
          tx.update(users)
            .set({ xp: after, lastLevelReached: levelFromXp(after), updatedAt: new Date() })
            .where(eq(users.id, userId))
            .run();
          return row?.xp ?? 0;
        },
        { behavior: "immediate" },
      );
    } catch (err) {
      logger.error({ err, userId, xp }, "XP set failed");
      throw err;
    }
    try {
      await this.db.insert(actionLogs).values({
        userId,
        action: "XP_SET",
        meta: JSON.stringify({ before, after, source: "admin" }),
      });
    } catch (err) {
      logger.error({ err, userId }, "XP_SET ledger write failed");
    }
    const oldLevel = levelFromXp(before);
    const newLevel = levelFromXp(after);
    return { oldLevel, newLevel, levelUp: newLevel > oldLevel, before, after };
  }

  /**
   * Top par XP (cohérent partout : slash /top, API /api/public/leaderboard,
   * dashboard /admin/leaderboards). Filtre xp > 0 pour éliminer les ~5800
   * users à 0 XP qui sont créés lazy par ensureUser mais n'ont jamais
   * envoyé de message. Sans ce filter le top affichait des doublons à 0.
   * Total order (xp, then id): pagination no longer duplicates or skips anyone among ties.
   */
  async top(limit = 10, offset = 0) {
    return this.db
      .select()
      .from(users)
      .where(and(sql`${users.xp} > 0`, rankedMembersOnly(users.id)))
      .orderBy(...rankOrdering(users.xp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Ordinal rank in the same order as {@link top}: the n-th of /top has rank n in /profil
   * and in the API (ties no longer get a rank other than the one displayed). Does not create
   * the row of an unknown member.
   */
  async rankOf(userId: string): Promise<number | null> {
    const u = await this.findUser(userId);
    if (!u || u.xp <= 0) return null;
    // A member who left (or a bot) has no rank, like in /top: counting only the members who are
    // ranked keeps the rank of /profil equal to the position shown by /top.
    const [self] = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.id, userId), rankedMembersOnly(users.id)));
    if (Number(self?.c ?? 0) === 0) return null;
    const [row] = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(
        and(
          or(sql`${users.xp} > ${u.xp}`, and(eq(users.xp, u.xp), lt(users.id, u.id))),
          rankedMembersOnly(users.id),
        ),
      );
    return Number(row?.c ?? 0) + 1;
  }

  async totalUsers(): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(and(sql`${users.xp} > 0`, rankedMembersOnly(users.id)));
    return Number(row?.c ?? 0);
  }

  async listRewards() {
    return this.db.select().from(levelRewards).orderBy(levelRewards.level);
  }

  /**
   * Announcement and rewards of a level change, once per XP gain even when it crosses several
   * levels (the embed then reads "Level 12 → 15"). `fromLevel` = previous level: the tier zeni
   * (`level_rewards`) is paid for EACH level crossed, while the race tier roles catch up every
   * level up to `newLevel`. `levelZeni` = what `addXP` credited for the levels crossed
   * (`zeni.per_level`): the announcement shows that credit plus the tier rewards paid here, and
   * no reward at all for a change that credited nothing (admin adjustment, frozen account).
   */
  async handleLevelUp(
    member: GuildMember,
    newLevel: number,
    fallbackChannel?: TextBasedChannel,
    fromLevel: number = newLevel - 1,
    levelZeni = 0,
  ) {
    // Le zéni de palier est RACE-AGNOSTIQUE (tout le monde le touche) ; les RÔLES
    // de palier dépendent de la RACE du membre (échelle dédiée, cf. race-levels.ts).
    const allRewards = await this.db
      .select()
      .from(levelRewards)
      .where(lte(levelRewards.level, newLevel))
      .orderBy(levelRewards.level);
    // Only the levels crossed here are credited: the previous ones already were.
    const crossedRewards = allRewards.filter((r) => r.level > fromLevel);

    // Rôles de transformation selon la race : on (re)pose ceux de la race du membre
    // jusqu'au niveau atteint (catch-up des paliers précédents inclus).
    const race = memberRaceId(member) ?? DEFAULT_LEVEL_RACE;
    const me = member.guild.members.me;
    for (const roleId of raceLevelRoleIds(race, newLevel)) {
      if (member.roles.cache.has(roleId)) continue;
      const role =
        member.guild.roles.cache.get(roleId) ??
        (await member.guild.roles.fetch(roleId).catch(() => null));
      if (!role) continue;
      if (me && role.position >= me.roles.highest.position) {
        logger.warn({ roleId, race }, "level reward role above bot — skipped");
        continue;
      }
      try {
        await member.roles.add(roleId, `Palier niveau ${newLevel} (${race})`);
      } catch (err) {
        logger.warn({ err, roleId }, "Failed to add level role");
      }
    }

    const economy = container.resolve(EconomyService);
    let rewardZeni = 0;
    for (const reward of crossedRewards) {
      if (reward.zeniBonus <= 0) continue;
      try {
        const res = await economy.creditZeni(member.id, reward.zeniBonus, {
          source: "level",
          applyRace: false,
        });
        rewardZeni += res.credited;
      } catch (err) {
        logger.error({ err, userId: member.id, level: reward.level }, "level reward zeni failed");
      }
    }
    // Exactly what was credited, shown as such in the announcement.
    const bonusZeni = Math.max(0, levelZeni) + rewardZeni;

    try {
      await this.db.insert(actionLogs).values({
        userId: member.id,
        action: "LEVEL_UP",
        meta: JSON.stringify({
          level: newLevel,
          fromLevel,
          bonusZeni,
          race,
          rewards: [raceLevelRoleAt(race, newLevel)].filter(Boolean),
        }),
      });
    } catch (err) {
      logger.error({ err, userId: member.id }, "LEVEL_UP ledger write failed");
    }

    // Résolution canal via MessageTemplateService
    const target = await this.templates.resolveTarget("level_up", member.client);
    if (target && !target.enabled) return;
    const channel =
      target?.channel ?? (fallbackChannel && "send" in fallbackChannel ? fallbackChannel : null);
    if (!channel) return;

    const u = await this.getUser(member.id);
    const lang = await this.settings.getLanguage();
    const embed = levelUpEmbed({
      member,
      lang,
      fromLevel,
      level: newLevel,
      xp: u?.xp ?? 0,
      zeniBonus: bonusZeni,
      message: levelUpMessage(member.id, newLevel, lang),
    });
    await channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
  }

  /**
   * Alignment plan of a member against their database row. `undefined` when the row is
   * missing (new or restored database: the level is unknown, nothing is inferred —
   * `findUser` does not create the row, `getUser` used to, which defeated the guard). The
   * level comes from the XP (`levelFromXp`), not from the cached level.
   */
  private async tierState(member: GuildMember, raceOverride?: RaceId) {
    const u = await this.findUser(member.id);
    if (!u) return undefined;
    const level = levelFromXp(u.xp);
    // `raceOverride` : la race que l'appelant vient de poser. Le cache des
    // rôles du membre ne la reflète qu'après l'événement de mise à jour.
    const race = raceOverride ?? memberRaceId(member) ?? DEFAULT_LEVEL_RACE;
    const plan = planTierRoles({ race, level, has: (id) => member.roles.cache.has(id) });
    return { u, level, race, plan };
  }

  /**
   * Realigns a member's tier roles with their RACE (race role, else the fallback race) and
   * level: grants the ones they are entitled to and, depending on `removal`, removes those
   * of another race (`foreign`, default: race change) or even those of their own ladder
   * ABOVE their level (`all`, opt-in: wrongly granted roles). Called on race change
   * (`/race`, role set by hand — events/JoinLeave.ts) and by the periodic reconciliation,
   * which removes nothing without an explicit request.
   */
  async syncRaceLevelRoles(
    member: GuildMember,
    raceOverride?: RaceId,
    options: { removal?: TierRemoval } = {},
  ): Promise<TierSyncResult | undefined> {
    const state = await this.tierState(member, raceOverride);
    if (!state) return undefined;
    const { u, level, race, plan } = state;
    const removal = options.removal ?? "foreign";
    const result: TierSyncResult = { level, race, plan, added: [], removed: [], suspect: false };

    // GARDE : si la race du membre n'a AUCUNE échelle configurée (aucun palier),
    // on NE touche à rien — surtout on ne retire pas ses rôles de palier existants
    // (bug « removed everything » au passage à une race non configurée). L'admin
    // doit d'abord configurer les paliers de cette race (dashboard → race-rewards).
    if (!hasRaceLadder(race)) return { ...result, skipped: "no-ladder" };

    // A tier of the member's own ladder above the stored level is only removed on explicit
    // request: the database may lag behind Discord (2026-10-22 incident: empty database, 210
    // tiers wrongly removed). A zero-XP row is the signature of an empty or restored database:
    // never a "total" removal on it.
    result.suspect = removal === "all" && u.xp <= 0;
    const toRemove =
      removal === "none" || result.suspect
        ? []
        : removal === "all"
          ? [...plan.foreign, ...plan.above]
          : plan.foreign;
    if (toRemove.length) {
      await member.roles
        .remove(toRemove, "Alignement des paliers — retrait des paliers non dus")
        .then(() => result.removed.push(...toRemove))
        .catch((err) => logger.warn({ err, race }, "race level role removal failed"));
    }

    // (Re)pose les paliers de la race courante jusqu'au niveau atteint.
    const me = member.guild.members.me;
    for (const roleId of plan.add) {
      const role =
        member.guild.roles.cache.get(roleId) ??
        (await member.guild.roles.fetch(roleId).catch(() => null));
      if (!role) continue;
      if (me && role.position >= me.roles.highest.position) continue;
      await member.roles
        .add(roleId, `Paliers ${race}`)
        .then(() => result.added.push(roleId))
        .catch((err) => logger.warn({ err, roleId }, "race level role add failed"));
    }

    // The stored level follows the XP: a stale level (edited curve, hand-corrected XP) is
    // rewritten here, and the displayed current role only targets the tier that is due.
    await this.db
      .update(users)
      .set({
        lastLevelReached: level,
        currentLevelRoleId: plan.entitled.at(-1) ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, member.id));
    return result;
  }

  /**
   * Passe TOUS les membres humains de la guilde par {@link syncRaceLevelRoles}.
   * Appelé par le cron `level-role-reconcile` (events/LevelRoleSync.ts) pour
   * rattraper les paliers manqués pendant un downtime, après une refonte des
   * échelles, ou pour un membre dont le rôle de race a été posé à la main.
   *
   * Tiers in EXCESS (above the level, or from another race) are counted on every pass
   * and only removed with `strip` (opt-in, report by default). Even with `strip`, the
   * pass removes nothing when more than half of the members would be affected: that is
   * the signature of a wrong database, not of cheating.
   *
   * Séquentiel volontairement : `syncRaceLevelRoles` fait des appels REST
   * (add/remove de rôles) et paralléliser sur toute la guilde déclencherait le
   * rate-limit global. En régime établi la passe ne coûte quasi rien (early
   * return si la race n'a pas d'échelle, skip des rôles déjà posés).
   *
   * Une erreur sur un membre (rôle au-dessus du bot, membre parti en cours de
   * route) n'interrompt pas la passe : elle est comptée et loguée.
   */
  async reconcileAllRaceLevelRoles(
    guild: Guild,
    options: { strip?: boolean } = {},
  ): Promise<TierReconcileStats> {
    const members = [...guild.members.cache.values()].filter((m) => !m.user.bot);
    const stats: TierReconcileStats = {
      scanned: 0,
      synced: 0,
      failed: 0,
      excessMembers: 0,
      excessRoles: 0,
      removedRoles: 0,
      mode: "report",
      sample: [],
    };

    // Pass 1: observe without writing anything (local reads, no REST call).
    let withRow = 0;
    for (const member of members) {
      try {
        const state = await this.tierState(member);
        if (!state) continue;
        withRow++;
        const { above, foreign } = state.plan;
        if (above.length + foreign.length === 0) continue;
        stats.excessMembers++;
        stats.excessRoles += above.length + foreign.length;
        if (stats.sample.length < 10) stats.sample.push({ userId: member.id, above, foreign });
      } catch (err) {
        logger.warn({ err, memberId: member.id }, "race level role audit failed");
      }
    }

    if (options.strip) {
      if (stats.excessMembers > MAX_STRIP_SHARE * Math.max(1, withRow)) stats.aborted = "share";
      else stats.mode = "apply";
    }

    // Pass 2: grant the due tiers; removal only in `apply` mode.
    for (const member of members) {
      stats.scanned++;
      try {
        const res = await this.syncRaceLevelRoles(member, undefined, {
          removal: stats.mode === "apply" ? "all" : "none",
        });
        stats.synced++;
        stats.removedRoles += res?.removed.length ?? 0;
      } catch (err) {
        stats.failed++;
        logger.warn({ err, memberId: member.id }, "race level role reconcile failed");
      }
    }

    return stats;
  }
}
