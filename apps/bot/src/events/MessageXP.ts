import { injectable, inject } from "tsyringe";
import { NotBot } from "@aphrody/discord-kit";
import { Bot, Discord, Guard, On, type ArgsOf } from "discordx";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { LevelService } from "~/services/LevelService";
import { EconomyService } from "~/services/EconomyService";
import { AchievementService } from "~/services/AchievementService";
import { DatabaseService } from "~/db/index";
import { actionLogs, users } from "~/db/schema";
import { DISCORD_INVITE_REGEX, ZENI_DAILY_QUEST } from "~/lib/constants";
import { env } from "~/lib/env";
import { levelFromXp, randomInt } from "~/lib/xp";
import { DEFAULT_LEVEL_RACE, memberRaceId, tierEntitlement } from "~/lib/race-levels";
import { applyZeniRace, hasRegen, regenTuning } from "~/lib/races";
import { resolveLevelChannel } from "~/lib/announce";
import { boosterXpMultiplier } from "~/lib/booster";
import {
  bestRoleMultiplier,
  loadMessageXpConfig,
  loadXpBoostConfig,
  messageBoost,
} from "~/lib/xp-boosts";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { ModerationService } from "~/services/ModerationService";
import { SettingsService } from "~/services/SettingsService";
import { logger } from "~/lib/logger";
import { achievementName } from "~/lib/achievement-names";
import { tn } from "~/lib/i18n";

@Discord()
@Bot("shenron")
@injectable()
export class MessageXPEvent {
  constructor(
    @inject(LevelService) private levels: LevelService,
    @inject(EconomyService) private eco: EconomyService,
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(ModerationService) private mod: ModerationService,
    @inject(AchievementService) private achievements: AchievementService,
    @inject(MessageTemplateService) private msg: MessageTemplateService,
    @inject(SettingsService) private settings: SettingsService,
  ) {}

  @On({ event: "messageCreate" })
  @Guard(NotBot)
  async onMessage([message]: ArgsOf<"messageCreate">) {
    // System messages (join, boost, pin...): their author wrote nothing.
    if (!message.inGuild() || message.system) return;
    const userId = message.author.id;

    // Anti-lien Discord externe — configurable via anti_invite.* (enabled / action / whitelist_url).
    const match = message.content.match(DISCORD_INVITE_REGEX);
    if (match && (await this.settings.getBool("anti_invite.enabled", true))) {
      const url = match[0].toLowerCase();
      const ownTail =
        env.SERVER_INVITE_URL?.replace(/^https?:\/\//, "")
          .toLowerCase()
          .split("/")
          .pop() ?? "";
      // Whitelist additionnelle. Le placeholder "discord.gg/" (défaut historique)
      // matcherait toutes les invites → on ne l'applique que s'il porte un
      // segment de chemin spécifique (ex: discord.gg/dragonball).
      const wl = (await this.settings.getString("anti_invite.whitelist_url", ""))
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "");
      const wlSpecific = wl !== "" && wl !== "discord.gg/" && /\/[^/]+/.test(wl);
      const isOwn = (ownTail !== "" && url.includes(ownTail)) || (wlSpecific && url.includes(wl));
      if (!isOwn && message.member && !message.member.permissions.has("ModerateMembers")) {
        await message.delete().catch(() => {});
        const action = (await this.settings.getString("anti_invite.action", "jail")).toLowerCase();
        try {
          if (action === "warn") {
            await this.mod.addWarn(userId, message.client.user!.id, "Lien Discord externe détecté");
          } else if (action === "delete") {
            // message déjà supprimé — aucune sanction supplémentaire
          } else {
            // "jail" (défaut, comportement historique) — couvre aussi toute valeur inconnue
            await this.mod.jail(
              message.member,
              message.client.user!.id,
              "Lien Discord externe détecté",
              24 * 3600_000,
            );
            await this.msg.publish(
              "anti_link_jail",
              { user: `<@${userId}>`, url: match[0] },
              message.client,
            );
          }
        } catch (err) {
          logger.warn({ err, action }, "anti-link action failed");
        }
        return;
      }
    }

    // XP + daily quest. A write failure (missing column, locked database) is logged with its
    // context then rethrown: the 2026-10-12 incident left the `users` table empty for ten days
    // because nobody saw these failures.
    let user: Awaited<ReturnType<LevelService["getUser"]>>;
    try {
      user = await this.levels.getUser(userId);
    } catch (err) {
      logger.error({ err, userId, op: "message-xp:getUser" }, "message XP: user row unavailable");
      throw err;
    }
    if (!user) return;
    const now = Date.now();

    // Quête quotidienne — message rendu par le template `daily_quest`.
    const today = new Date(now).setHours(0, 0, 0, 0);
    const lastQuest = user.lastDailyQuestAt?.getTime() ?? 0;
    if (lastQuest < today) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDelta = today - yesterday.setHours(0, 0, 0, 0);
      const streak = lastQuest >= today - yesterdayDelta ? user.dailyStreak + 1 : 1;
      // Réclamation conditionnelle : deux messages simultanés lisaient tous
      // deux « nouveau jour » et versaient la quête deux fois.
      if (this.claim(userId, "lastDailyQuestAt", today, now, { dailyStreak: streak })) {
        const dailyZeni = applyZeniRace(
          user.race,
          await this.settings.getInt("zeni.daily_quest", ZENI_DAILY_QUEST),
        );
        // Via `addZeni` : incrément atomique (l'ancien `user.zeni + n`, calculé
        // sur une lecture antérieure, écrasait les gains concurrents), gel et
        // anti-triche respectés. La race est déjà appliquée ci-dessus.
        await this.eco.addZeni(userId, dailyZeni, { source: "daily", applyRace: false });
        await this.dbs.db.insert(actionLogs).values({
          userId,
          action: "ZENI_DAILY",
          meta: JSON.stringify({ amount: dailyZeni }),
        });
        // `streakDays` agrees the noun with the count ("1 jour", "5 jours"), per language.
        const lang = await this.msg.lang();
        await this.msg.publish(
          "daily_quest",
          {
            user: `<@${userId}>`,
            zeni: dailyZeni,
            streak,
            streakDays: tn(lang, "plural.days", streak),
          },
          message.client,
        );
      }
    }

    // Succès — résolution lazy via le template service (gère canal + texte).
    // Le premier message n'est annoncé qu'à l'attribution effective du succès :
    // deux messages simultanés ne l'annoncent plus deux fois.
    const granted = await this.achievements.checkMessage(userId, message.content);
    // Members read the localized name of an achievement, never its technical code.
    const lang = await this.msg.lang();
    if (user.messageCount === 0 && (await this.eco.grantAchievement(userId, "FIRST_MESSAGE"))) {
      await this.msg.publish(
        "first_message",
        {
          user: `<@${userId}>`,
          userName: message.author.username,
          name: achievementName(lang, "FIRST_MESSAGE"),
        },
        message.client,
      );
    }
    for (const code of granted) {
      await this.msg.publish(
        "achievement_unlocked",
        {
          user: `<@${userId}>`,
          userName: message.author.username,
          code,
          name: achievementName(lang, code),
          description: this.achievements.descriptionOf(code) ?? "",
        },
        message.client,
      );
    }
    // Incrément atomique (l'ancien `messageCount + 1` perdait des messages concurrents).
    await this.dbs.db
      .update(users)
      .set({ messageCount: sql`${users.messageCount} + 1` })
      .where(eq(users.id, userId));

    // Toggle features.message_xp — fallback true (DB vide = activé par défaut, jamais couper l'XP par accident).
    if (!(await this.settings.getBool("features.message_xp", true))) return;

    // XP cooldown — settings runtime avec fallback constants. Le créneau est
    // réclamé atomiquement : deux messages dans la même milliseconde ne
    // rapportent plus deux gains.
    const base = await loadMessageXpConfig(this.settings);
    if (!this.claim(userId, "lastMessageAt", now - base.cooldownMs + 1, now)) return;
    let gain = randomInt(base.min, base.max);

    // Régén passive Namek : 1×/24 h, à la 1re activité du jour (+XP & +zéni).
    const regen = regenTuning();
    if (hasRegen(user.race) && this.claim(userId, "lastRaceRegenAt", now - regen.ms + 1, now)) {
      await this.eco.addZeni(userId, regen.zeni, { source: "regen", applyRace: false });
      await this.dbs.db.insert(actionLogs).values({
        userId,
        action: "ZENI_REGEN",
        meta: JSON.stringify({ amount: regen.zeni }),
      });
      gain += regen.xp;
    }

    // Drop zeni aléatoire (zeni.message_chance probabilité) + notif templatable
    const dropChance = await this.settings.getFloat("zeni.message_chance", 0);
    if (dropChance > 0 && Math.random() < dropChance) {
      const dropMin = await this.settings.getInt("zeni.message_drop_min", 5);
      const dropMax = await this.settings.getInt("zeni.message_drop_max", 25);
      const drop = applyZeniRace(user.race, randomInt(dropMin, dropMax));
      if (drop > 0) {
        await this.eco.addZeni(userId, drop, { source: "drop", applyRace: false });
        await this.dbs.db.insert(actionLogs).values({
          userId,
          action: "ZENI_DROP",
          meta: JSON.stringify({ amount: drop }),
        });
        await this.msg.publish("zeni_drop", { user: `<@${userId}>`, zeni: drop }, message.client);
      }
    }

    // Multiplicateurs : meilleur rôle boosté ou boost booster (ne se cumulent
    // pas), race et Zenkai, boost de nuit, sous le plafond `xp.multiplier.max`.
    // A tier role only multiplies from the level at which the ladder grants it:
    // "Perfect Ultra Instinct" (x32,000) held by a level-17 member earns nothing.
    const member = message.member;
    const roleMultiplier = member
      ? bestRoleMultiplier(
          (roleId) => member.roles.cache.has(roleId),
          await this.settings.getXpBoostRoles(),
          await boosterXpMultiplier(member, this.settings),
          tierEntitlement(levelFromXp(user.xp), memberRaceId(member) ?? DEFAULT_LEVEL_RACE),
        )
      : 1;
    const boost = messageBoost(
      { roleMultiplier, race: user.race, raceBoostUntil: user.raceBoostUntil?.getTime() ?? 0, now },
      await loadXpBoostConfig(this.settings),
    );
    gain = Math.floor(gain * boost.total);

    const res = await this.levels.addXP(userId, gain, { propagateFusion: true, source: "message" });
    if (res.levelUp) {
      const announce =
        (await resolveLevelChannel(message.client, message.guild ?? undefined)) ??
        ("send" in message.channel ? message.channel : undefined);
      // Fallback : si message.member est null (intent GuildMembers pas encore
      // hydraté, cache miss), fetch côté Discord avant de poser le rôle.
      const leveled =
        member ??
        (message.guild ? await message.guild.members.fetch(userId).catch(() => null) : null);
      if (leveled) {
        await this.levels.handleLevelUp(
          leveled,
          res.newLevel,
          announce,
          res.oldLevel,
          res.levelZeni,
        );
      } else {
        logger.warn(
          { userId, newLevel: res.newLevel },
          "levelUp détecté mais GuildMember introuvable — rôle level non posé",
        );
      }
    }
  }

  /**
   * Pose `column = now` seulement si sa valeur précédente est absente ou
   * antérieure à `before`. Synchrone (bun:sqlite) : aucun `await` entre le
   * contrôle et l'écriture, donc un seul message concurrent l'emporte.
   */
  private claim(
    userId: string,
    column: "lastDailyQuestAt" | "lastMessageAt" | "lastRaceRegenAt",
    before: number,
    now: number,
    extra: Partial<typeof users.$inferInsert> = {},
  ): boolean {
    const col = users[column];
    const rows = this.dbs.db
      .update(users)
      .set({ [column]: new Date(now), ...extra })
      .where(and(eq(users.id, userId), or(isNull(col), lt(col, new Date(before)))))
      .returning({ id: users.id })
      .all();
    return rows.length > 0;
  }
}
