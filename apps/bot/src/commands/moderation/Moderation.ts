import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  ChannelType,
  type CommandInteraction,
  type User,
  type TextChannel,
  type Client,
  type APIEmbedField,
  PermissionFlagsBits,
  MessageFlags,
  Routes,
} from "discord.js";
import type { PersonaId } from "~/lib/personas";
import { GuildOnly } from "~/guards/GuildOnly";
import { ModerationService } from "~/services/ModerationService";
import { LogService } from "~/services/LogService";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { container } from "tsyringe";
import {
  sanctionEmbed,
  sanctionLogEmbed,
  brandedEmbed,
  errorEmbed,
  successEmbed,
  warningEmbed,
} from "~/lib/embeds";
import { canManageRole } from "~/lib/hierarchy";
import { gifFor } from "~/lib/sanction-gif";
import {
  MAX_TIMEOUT_MS,
  NO_REASON,
  auditReason,
  discordErrorCode,
  discordTime,
  dmField,
  errorMessage,
  failInteraction,
  formatDuration,
  notifySanction,
  parseBoundedDuration,
  resolveSanctionTarget,
} from "~/lib/sanction-helpers";
import type { GuildBasedChannel, Collection, Snowflake } from "discord.js";

/** Discord API error code of `DELETE /guilds/{id}/bans/{user}` on a user who is not banned. */
const UNKNOWN_BAN = 10026;

type AnnouncedAction = "warn" | "mute" | "unmute" | "kick" | "ban" | "unban";

@Discord()
@Bot("shenron")
@Guard(GuildOnly)
@injectable()
export class ModerationCommands {
  constructor(
    @inject(ModerationService) private mod: ModerationService,
    @inject(LogService) private logs: LogService,
  ) {}

  /**
   * Common ending of a sanction: detailed embed (moderator, reason, duration,
   * DM) to the reply and the sanction log; `compact` keeps the public reply to
   * the one-line persona announcement (ban, kick) and the details in the log.
   */
  private async announce(
    interaction: CommandInteraction<"cached">,
    opts: {
      target: User;
      action: AnnouncedAction;
      reason?: string;
      duration?: string;
      dmDelivered?: boolean;
      compact?: boolean;
      fields?: APIEmbedField[];
    },
  ): Promise<void> {
    const gifUrl = await gifFor(opts.action);
    const detailed = sanctionEmbed({
      target: opts.target,
      moderator: interaction.user,
      action: opts.action,
      reason: opts.reason,
      duration: opts.duration,
      gifUrl,
    });
    if (opts.fields?.length) detailed.addFields(opts.fields);
    if (opts.dmDelivered !== undefined) detailed.addFields(dmField(opts.dmDelivered));
    const publicEmbed =
      opts.compact && (opts.action === "ban" || opts.action === "kick")
        ? sanctionLogEmbed({ target: opts.target, action: opts.action, gifUrl })
        : detailed;
    await interaction.editReply({ embeds: [publicEmbed] }).catch(() => {});
    await this.logs.send(interaction.client, "sanction", detailed);
  }

  // ────────────────────────────── /warn
  @Slash({ name: "warn", description: "Avertir un membre" })
  async warn(
    @SlashOption(
      {
        name: "membre",
        description: "Membre à avertir",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "raison",
      description: "Raison",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    // A warn stays possible on a user who left (history only), never on a bot.
    const checked = await resolveSanctionTarget(interaction, target, {
      requireMember: false,
      allowBots: false,
    });
    if (!checked) return;
    await interaction.deferReply();

    await this.mod.addWarn(target.id, interaction.user.id, reason);
    const count = await this.mod.countWarns(target.id);
    const dmDelivered = await notifySanction({
      target,
      moderator: interaction.user,
      kind: "warn",
      guildName: interaction.guild.name,
      reason,
      footer: `Tu as ${count} avertissement(s) actif(s).`,
    });
    await this.announce(interaction, {
      target,
      action: "warn",
      reason,
      dmDelivered,
      fields: [{ name: "Total warns actifs", value: String(count), inline: true }],
    });
  }

  // ────────────────────────────── /unwarn
  @Slash({ name: "unwarn", description: "Retirer le dernier warn d'un membre" })
  async unwarn(
    @SlashOption(
      {
        name: "membre",
        description: "Membre",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    interaction: CommandInteraction,
  ) {
    const ok = await this.mod.removeLastWarn(target.id, interaction.user.id);
    await interaction.reply({
      embeds: [
        ok
          ? successEmbed("Warn retiré", `Dernier avertissement retiré à <@${target.id}>.`)
          : warningEmbed("Aucun warn actif", `<@${target.id}> n'a aucun avertissement actif.`),
      ],
      flags: ok ? undefined : MessageFlags.Ephemeral,
    });
  }

  // ────────────────────────────── /warns
  @Slash({ name: "warns", description: "Lister les avertissements actifs d'un membre" })
  async warns(
    @SlashOption(
      {
        name: "membre",
        description: "Membre",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    interaction: CommandInteraction,
  ) {
    const list = await this.mod.listActiveWarns(target.id);
    if (list.length === 0) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            title: "📋 Avertissements",
            description: `Aucun avertissement actif pour <@${target.id}>.`,
            kind: "muted",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const embed = brandedEmbed({
      title: `📋 Avertissements de ${target.username}`,
      description: `**${list.length}** avertissement(s) actif(s)`,
      kind: "warning",
    }).addFields(
      // Field names do not render mentions: moderator and date go in the value.
      list.slice(0, 25).map((w) => ({
        name: `Warn #${w.id}`,
        value: `${discordTime(w.createdAt, "R")} · par <@${w.moderatorId}>\nMotif : ${(w.reason ?? NO_REASON).slice(0, 900)}`,
      })),
    );
    if (list.length > 25) embed.setFooter({ text: `25 affichés sur ${list.length}` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ────────────────────────────── /clearwarns
  @Slash({
    name: "clearwarns",
    description: "Purger TOUS les avertissements actifs d'un membre (admin)",
  })
  async clearwarns(
    @SlashOption(
      {
        name: "membre",
        description: "Membre",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "raison",
      description: "Raison de la purge",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    interaction: CommandInteraction,
  ) {
    const n = await this.mod.clearWarns(target.id, interaction.user.id);
    await interaction.reply({
      embeds: [
        n > 0
          ? successEmbed(
              "Warns purgés",
              `**${n}** avertissement(s) actif(s) supprimé(s) pour <@${target.id}>.${reason ? `\n\nRaison : ${reason}` : ""}`,
            )
          : warningEmbed("Aucun warn actif", `<@${target.id}> n'a aucun avertissement à purger.`),
      ],
    });
  }

  // ────────────────────────────── /mute
  @Slash({ name: "mute", description: "Mute (timeout Discord) un membre" })
  async mute(
    @SlashOption(
      {
        name: "membre",
        description: "Membre à mute",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "duree",
      description: "Durée (ex: 10m, 1h, 1d) — max 28d",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    duration: string,
    @SlashOption({
      name: "raison",
      description: "Raison",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const parsed = parseBoundedDuration(duration, {
      minMs: 1_000,
      maxMs: MAX_TIMEOUT_MS,
      required: true,
    });
    if (!parsed.ok) {
      await failInteraction(
        interaction,
        errorEmbed("Durée invalide", `${parsed.reason}\nMaximum **28 jours** (limite Discord).`),
      );
      return;
    }
    const ms = parsed.ms;
    const checked = await resolveSanctionTarget(interaction, target, { requireMember: true });
    const member = checked?.member;
    if (!member) return;
    if (!member.moderatable) {
      await failInteraction(
        interaction,
        errorEmbed(
          "Permissions insuffisantes",
          `Le bot ne peut pas timeout ${target} (rôle plus haut, administrateur ou perm absente).`,
        ),
      );
      return;
    }
    await interaction.deferReply();

    try {
      await member.timeout(ms, auditReason(reason, interaction.user));
    } catch (err) {
      await failInteraction(interaction, errorEmbed("Échec mute", errorMessage(err)));
      return;
    }
    await this.mod.log("MUTE", target.id, interaction.user.id, reason, { durationMs: ms });

    const until = new Date(Date.now() + ms);
    const dmDelivered = await notifySanction({
      target,
      moderator: interaction.user,
      kind: "mute",
      guildName: interaction.guild.name,
      reason,
      durationMs: ms,
    });
    await this.announce(interaction, {
      target,
      action: "mute",
      reason,
      duration: `${formatDuration(ms)} · fin ${discordTime(until)}`,
      dmDelivered,
    });
  }

  // ────────────────────────────── /unmute
  @Slash({ name: "unmute", description: "Retirer le mute d'un membre" })
  async unmute(
    @SlashOption(
      {
        name: "membre",
        description: "Membre",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "raison",
      description: "Raison",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member || member.id !== target.id) {
      await failInteraction(
        interaction,
        errorEmbed("Membre introuvable", `<@${target.id}> n'est plus sur le serveur.`),
      );
      return;
    }
    if (!member.isCommunicationDisabled()) {
      await failInteraction(
        interaction,
        warningEmbed("Pas mute", `<@${target.id}> n'est pas mute.`),
      );
      return;
    }
    await interaction.deferReply();
    try {
      await member.timeout(
        null,
        reason?.trim() ? auditReason(reason, interaction.user) : "manual unmute",
      );
    } catch (err) {
      // The timeout is still running: never report an unmute that did not happen.
      await failInteraction(interaction, errorEmbed("Échec unmute", errorMessage(err)));
      return;
    }
    await this.mod.log("UNMUTE", target.id, interaction.user.id, reason);
    await this.announce(interaction, { target, action: "unmute", reason });
  }

  // ────────────────────────────── /ban
  @Slash({ name: "ban", description: "Bannir un membre" })
  async ban(
    @SlashOption(
      {
        name: "membre",
        description: "Membre à ban",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "raison",
      description: "Raison",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    @SlashOption({
      name: "purge-jours",
      description: "Supprimer les messages des N derniers jours (0-7, défaut 0)",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 0,
      maxValue: 7,
    })
    deleteDays: number | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    // L'accès à /ban est exclusivement déterminé par CommandPermissions,
    // configuré dans le dashboard. Le bot conserve, lui, la permission Discord
    // Ban Members nécessaire pour exécuter l'action au nom du staff autorisé.
    // A user who already left can still be banned (by ID); a member goes
    // through the staff hierarchy and the bot's ability to ban them.
    const checked = await resolveSanctionTarget(interaction, target, { requireMember: false });
    if (!checked) return;
    if (checked.member && !checked.member.bannable) {
      await failInteraction(
        interaction,
        errorEmbed("Permissions insuffisantes", `Le bot ne peut pas bannir ${target}.`),
      );
      return;
    }
    await interaction.deferReply();

    // DM avant ban (sinon on ne peut plus joindre la cible une fois bannie)
    const dmDelivered = checked.member
      ? await notifySanction({
          target,
          moderator: interaction.user,
          kind: "ban",
          guildName: interaction.guild.name,
          reason,
        })
      : false;

    try {
      await interaction.guild.members.ban(target.id, {
        reason: auditReason(reason, interaction.user),
        deleteMessageSeconds: (deleteDays ?? 0) * 86_400,
      });
    } catch (err) {
      await failInteraction(interaction, errorEmbed("Échec ban", errorMessage(err)));
      return;
    }
    await this.mod.addBan(target.id, interaction.user.id, reason);
    await this.announce(interaction, {
      target,
      action: "ban",
      reason,
      dmDelivered,
      compact: true,
      fields:
        deleteDays && deleteDays > 0
          ? [{ name: "Messages purgés", value: `${deleteDays} j`, inline: true }]
          : [],
    });
  }

  // ────────────────────────────── /unban
  @Slash({ name: "unban", description: "Débannir un utilisateur (par ID)" })
  async unban(
    @SlashOption({
      name: "userid",
      description: "ID utilisateur à débannir",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    userId: string,
    @SlashOption({
      name: "raison",
      description: "Raison",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({
        embeds: [errorEmbed("ID invalide", "Snowflake Discord attendu (17-20 chiffres).")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply();
    try {
      await interaction.guild.members.unban(userId, auditReason(reason, interaction.user));
    } catch (err) {
      if (discordErrorCode(err) === UNKNOWN_BAN) {
        // Not banned on Discord: still close a stale active ban in the database.
        await this.mod.removeBan(userId, interaction.user.id, reason);
        await failInteraction(
          interaction,
          warningEmbed("Pas banni", `<@${userId}> n'est pas banni de ce serveur.`),
        );
        return;
      }
      await failInteraction(interaction, errorEmbed("Échec unban", errorMessage(err)));
      return;
    }
    await this.mod.removeBan(userId, interaction.user.id, reason);
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (user) {
      await this.announce(interaction, { target: user, action: "unban", reason });
      return;
    }
    await interaction
      .editReply({ embeds: [successEmbed("Débannissement effectué", `<@${userId}> débanni.`)] })
      .catch(() => {});
  }

  // ────────────────────────────── /kick
  @Slash({ name: "kick", description: "Expulser un membre" })
  async kick(
    @SlashOption(
      {
        name: "membre",
        description: "Membre à kick",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "raison",
      description: "Raison",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const checked = await resolveSanctionTarget(interaction, target, { requireMember: true });
    const member = checked?.member;
    if (!member) return;
    if (!member.kickable) {
      await failInteraction(
        interaction,
        errorEmbed("Permissions insuffisantes", `Le bot ne peut pas expulser ${target}.`),
      );
      return;
    }
    await interaction.deferReply();
    const dmDelivered = await notifySanction({
      target,
      moderator: interaction.user,
      kind: "kick",
      guildName: interaction.guild.name,
      reason,
    });
    try {
      await member.kick(auditReason(reason, interaction.user));
    } catch (err) {
      // Never announce a kick that Discord refused.
      await failInteraction(interaction, errorEmbed("Échec kick", errorMessage(err)));
      return;
    }
    await this.mod.log("KICK", target.id, interaction.user.id, reason);
    await this.announce(interaction, {
      target,
      action: "kick",
      reason,
      dmDelivered,
      compact: true,
    });
  }

  // ────────────────────────────── /clear
  @Slash({ name: "clear", description: "Supprimer un nombre de messages (1-100)" })
  async clear(
    @SlashOption({
      name: "nombre",
      description: "Nombre (1-100)",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
      maxValue: 100,
    })
    amount: number,
    @SlashOption(
      {
        name: "membre",
        description: "Filtrer par auteur",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    target: User | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    if (!interaction.channel?.isTextBased() || !("bulkDelete" in interaction.channel)) {
      await interaction.reply({
        embeds: [errorEmbed("Salon non supporté")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ch = interaction.channel as TextChannel;
    let deleted: { size: number };
    try {
      const messages = await ch.messages.fetch({ limit: target ? 100 : amount });
      const filtered = target
        ? messages.filter((m) => m.author.id === target.id).first(amount)
        : messages.first(amount);
      const toDelete = Array.isArray(filtered) ? filtered : [...filtered];
      // `true` skips messages older than 14 days instead of failing the batch.
      deleted = await ch.bulkDelete(toDelete, true);
    } catch (err) {
      await failInteraction(interaction, errorEmbed("Échec clear", errorMessage(err)));
      return;
    }
    await this.mod.log("PURGE", null, interaction.user.id, undefined, {
      count: deleted.size,
      target: target?.id,
      channelId: interaction.channelId,
    });
    await interaction.editReply({
      embeds: [
        successEmbed(
          `${deleted.size} message(s) supprimé(s)`,
          target ? `Filtre : <@${target.id}>` : undefined,
        ),
      ],
    });
  }

  // ────────────────────────────── /purge
  /**
   * /purge — supprime les messages d'un membre (ou de tous) sur un large
   * périmètre :
   *  - **salon courant** par défaut (jusqu'à `nombre`, max 1000),
   *  - **un autre salon** si `salon` est précisé,
   *  - **tout le serveur** si `global=true` (parcourt tous les TextChannels
   *    accessibles au bot, batch 100).
   *
   * Limite Discord : `bulkDelete` ne supprime que les messages de **moins de
   * 14 jours**. Les plus vieux sont silencieusement ignorés.
   * Vegeta — Final Explosion.
   */
  @Slash({
    name: "purge",
    description: "Purger massivement les messages d'un membre (salon ou serveur entier)",
  })
  async purge(
    @SlashOption(
      {
        name: "membre",
        description: "Cible (laisser vide = tout le monde)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    target: User | undefined,
    @SlashOption({
      name: "nombre",
      description: "Nombre max de messages à supprimer (1-1000, défaut 100)",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1,
      maxValue: 1000,
    })
    amount: number | undefined,
    @SlashOption({
      name: "salon",
      description: "Salon spécifique (défaut : salon courant)",
      type: ApplicationCommandOptionType.Channel,
      required: false,
      channelTypes: [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
      ],
    })
    channel: GuildBasedChannel | undefined,
    @SlashOption({
      name: "categorie",
      description: "Cible toute une catégorie (override `salon`, ignoré si `global`)",
      type: ApplicationCommandOptionType.Channel,
      required: false,
      channelTypes: [ChannelType.GuildCategory],
    })
    categoryScope: GuildBasedChannel | undefined,
    @SlashOption({
      name: "global",
      description:
        "Parcourir TOUS les salons textuels du serveur (override `salon` et `categorie`)",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    globalScope: boolean | undefined,
    @SlashOption({
      name: "lockdown",
      description:
        "Après purge, retire ViewChannel à @everyone sur les salons ciblés (rend invisible)",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    lockdown: boolean | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    // Hiérarchie staff — empêcher de purger un membre au-dessus
    if (target) {
      const checked = await resolveSanctionTarget(interaction, target, { requireMember: false });
      if (!checked) return;
    }
    const limit = amount ?? 100;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Détermine la liste des salons à parcourir
    let scope: TextChannel[];
    if (globalScope) {
      const all = interaction.guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement,
      ) as Collection<Snowflake, TextChannel>;
      scope = [...all.values()];
    } else if (categoryScope) {
      // Tous les salons textuels enfants de la catégorie. On exclut les threads
      // (héritent du parent) et les vocaux/forums.
      const cat = interaction.guild.channels.cache.filter(
        (c) =>
          c.parentId === categoryScope.id &&
          (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement),
      ) as Collection<Snowflake, TextChannel>;
      scope = [...cat.values()];
      if (scope.length === 0) {
        await interaction.editReply({
          embeds: [warningEmbed("Catégorie vide", "Aucun salon textuel dans cette catégorie.")],
        });
        return;
      }
    } else if (channel) {
      if (!("bulkDelete" in channel)) {
        await interaction.editReply({
          embeds: [errorEmbed("Salon non supporté", "Seuls les salons textuels sont purgeable.")],
        });
        return;
      }
      scope = [channel as unknown as TextChannel];
    } else {
      const here = interaction.channel;
      if (!here || !("bulkDelete" in here)) {
        await interaction.editReply({ embeds: [errorEmbed("Salon non supporté")] });
        return;
      }
      scope = [here as unknown as TextChannel];
    }

    // Suppression : par batches de 100 (limite bulkDelete) jusqu'à `limit`
    let totalDeleted = 0;
    let scanned = 0;
    const skippedChannels: string[] = [];
    for (const ch of scope) {
      if (totalDeleted >= limit) break;
      // Skip si bot n'a pas les perms
      const me = interaction.guild.members.me;
      if (
        me &&
        !ch
          .permissionsFor(me)
          ?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
          ])
      ) {
        skippedChannels.push(ch.name);
        continue;
      }
      let lastId: string | undefined;
      // Boucle de fetch (pages de 100)
      for (let i = 0; i < 10 && totalDeleted < limit; i++) {
        const fetched: Collection<Snowflake, import("discord.js").Message> = await ch.messages
          .fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) })
          .catch(() => null as unknown as Collection<Snowflake, import("discord.js").Message>);
        if (!fetched || fetched.size === 0) break;
        scanned += fetched.size;
        lastId = fetched.last()?.id;
        const matching = target ? fetched.filter((m) => m.author.id === target.id) : fetched;
        if (matching.size === 0) continue;
        const remaining = limit - totalDeleted;
        const toDelete = [...matching.values()].slice(0, remaining);
        try {
          const res = await ch.bulkDelete(toDelete, true);
          totalDeleted += res.size;
        } catch {
          // bulkDelete failed (ex: thread sans perms) → ignore et suivant
          break;
        }
        if (fetched.size < 100) break;
      }
    }

    // Lockdown : retire ViewChannel à @everyone sur tous les salons du scope
    // (ou la catégorie si fournie — l'override sur la catégorie cache toute
    // la branche). Idempotent via permissionOverwrites.edit (merge).
    let lockedCount = 0;
    const lockedFails: string[] = [];
    if (lockdown) {
      const everyone = interaction.guild.roles.everyone;
      const targets: GuildBasedChannel[] = categoryScope
        ? [categoryScope, ...scope]
        : scope.slice();
      for (const ch of targets) {
        // Threads héritent du parent — on les saute (lock parent suffit).
        if (!("permissionOverwrites" in ch)) continue;
        try {
          await ch.permissionOverwrites.edit(
            everyone,
            { ViewChannel: false },
            { reason: `purge lockdown by ${interaction.user.username}` },
          );
          lockedCount++;
        } catch (err) {
          lockedFails.push(`#${ch.name}: ${(err as Error).message}`);
        }
      }
    }

    const scopeLabel = globalScope
      ? "global"
      : categoryScope
        ? `📁${categoryScope.name}`
        : channel
          ? `#${channel.name}`
          : `#${(interaction.channel as TextChannel | null)?.name ?? "?"}`;
    await this.mod.log("PURGE", target?.id ?? null, interaction.user.id, undefined, {
      scope: scopeLabel,
      target: target?.id,
      deleted: totalDeleted,
      scanned,
      channels: scope.length,
      skippedChannels,
      lockdown: lockdown ? lockedCount : undefined,
    });

    const desc = [
      `**Supprimés :** ${totalDeleted}${target ? ` · cible <@${target.id}>` : ""}`,
      `**Salons parcourus :** ${scope.length}${skippedChannels.length ? ` (skipped: ${skippedChannels.length})` : ""}`,
      `**Messages scannés :** ${scanned}`,
      lockdown
        ? `**Lockdown :** ${lockedCount} salon(s) cachés à @everyone${lockedFails.length ? ` (échecs: ${lockedFails.length})` : ""}`
        : "",
      "",
      "_Limite Discord : seuls les messages de moins de 14 jours sont effaçables._",
    ]
      .filter(Boolean)
      .join("\n");

    // Confirmation publique avec GIF Vegeta sacrifice (sanction-style).
    // Respecte le toggle `mod_purge_announce` du dashboard `/messages` : si
    // l'admin a désactivé l'événement, l'annonce publique est skip mais le log
    // sanctions reste. Si l'admin a surchargé le template, le rendu remplace
    // la description par défaut.
    const templates = container.resolve(MessageTemplateService);
    const purgeRender = await templates.render("mod_purge_announce", {
      moderator: interaction.user.id,
      deleted: totalDeleted,
      target: target?.id ?? "",
      targetClause: target ? ` de <@${target.id}>` : "",
      scope: scopeLabel,
    });
    const publicEmbed = brandedEmbed({
      title: "💥 Purge — Final Explosion",
      description:
        purgeRender?.rendered ??
        (target
          ? `<@${interaction.user.id}> a purgé **${totalDeleted}** message(s) de <@${target.id}>.`
          : `<@${interaction.user.id}> a purgé **${totalDeleted}** message(s).`),
      kind: "warning",
    });
    const gif = await gifFor("purge");
    if (gif) publicEmbed.setImage(gif);
    if (purgeRender?.enabled !== false && interaction.channel && "send" in interaction.channel) {
      await (interaction.channel as TextChannel).send({ embeds: [publicEmbed] }).catch(() => {});
    }
    await this.logs.send(interaction.client, "sanction", publicEmbed);

    // A long global purge can outlive the 15 min interaction token: the log above stays.
    await interaction.editReply({ embeds: [successEmbed("Purge terminée", desc)] }).catch(() => {});
  }

  // ────────────────────────────── /slowmode
  @Slash({ name: "slowmode", description: "Définir le slowmode du salon (0 = off, max 21600s)" })
  async slowmode(
    @SlashOption({
      name: "secondes",
      description: "Secondes (0 = off, max 21600 = 6h)",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 0,
      maxValue: 21_600,
    })
    seconds: number,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const ch = interaction.channel;
    if (!ch || !("setRateLimitPerUser" in ch)) {
      await interaction.reply({
        embeds: [errorEmbed("Salon non supporté")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await (ch as TextChannel).setRateLimitPerUser(
        seconds,
        `slowmode by ${interaction.user.username}`,
      );
      await this.mod.log("SLOWMODE", null, interaction.user.id, undefined, {
        seconds,
        channelId: interaction.channelId,
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            seconds === 0 ? "Slowmode désactivé" : `Slowmode : ${seconds}s`,
            seconds === 0
              ? "Plus de limite par utilisateur."
              : `Chaque membre doit attendre **${seconds}s** entre 2 messages.`,
          ),
        ],
      });
    } catch (err) {
      await interaction.reply({
        embeds: [errorEmbed("Échec slowmode", (err as Error).message)],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // ────────────────────────────── /lock
  @Slash({ name: "lock", description: "Verrouiller le salon (refuse SendMessages à @everyone)" })
  async lock(
    @SlashOption({
      name: "raison",
      description: "Raison",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    reason: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const ch = interaction.channel;
    if (!ch || ch.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [errorEmbed("Salon non supporté", "Salon textuel uniquement.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await (ch as TextChannel).permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: false },
        { reason: reason ?? `lock by ${interaction.user.username}` },
      );
      await this.mod.log("LOCK", null, interaction.user.id, reason, {
        channelId: interaction.channelId,
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            `🔒 Salon verrouillé`,
            reason ? `Motif : ${reason}` : "Personne ne peut plus écrire ici jusqu'à `/unlock`.",
          ),
        ],
      });
    } catch (err) {
      await interaction.reply({
        embeds: [errorEmbed("Échec lock", (err as Error).message)],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // ────────────────────────────── /unlock
  @Slash({ name: "unlock", description: "Déverrouiller le salon" })
  async unlock(interaction: CommandInteraction) {
    if (!interaction.inCachedGuild()) return;
    const ch = interaction.channel;
    if (!ch || ch.type !== ChannelType.GuildText) {
      await interaction.reply({
        embeds: [errorEmbed("Salon non supporté")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await (ch as TextChannel).permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: null },
        { reason: `unlock by ${interaction.user.username}` },
      );
      await this.mod.log("UNLOCK", null, interaction.user.id, undefined, {
        channelId: interaction.channelId,
      });
      await interaction.reply({ embeds: [successEmbed("🔓 Salon déverrouillé")] });
    } catch (err) {
      await interaction.reply({
        embeds: [errorEmbed("Échec unlock", (err as Error).message)],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // ────────────────────────────── /nick
  @Slash({ name: "nick", description: "Changer le pseudo d'un membre (laisse vide pour reset)" })
  async nick(
    @SlashOption(
      {
        name: "membre",
        description: "Membre",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "pseudo",
      description: "Nouveau pseudo (vide = reset)",
      type: ApplicationCommandOptionType.String,
      required: false,
      maxLength: 32,
    })
    newNick: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    // Renaming oneself is allowed; anyone else goes through the staff hierarchy.
    let member;
    if (target.id === interaction.user.id) {
      member = interaction.member;
    } else {
      const checked = await resolveSanctionTarget(interaction, target, { requireMember: true });
      if (!checked?.member) return;
      member = checked.member;
    }
    if (!member.manageable) {
      await failInteraction(
        interaction,
        errorEmbed("Hiérarchie", `Le bot ne peut pas modifier ${target}.`),
      );
      return;
    }
    const nick = newNick?.trim() || null;
    try {
      await member.setNickname(nick, `nick by ${interaction.user.username}`);
      await this.mod.log("NICK", target.id, interaction.user.id, undefined, { newNick: nick });
      await interaction.reply({
        embeds: [
          successEmbed(
            nick ? `Pseudo changé` : `Pseudo réinitialisé`,
            nick ? `<@${target.id}> → **${nick}**` : `<@${target.id}> retrouve son nom Discord.`,
          ),
        ],
      });
    } catch (err) {
      await failInteraction(interaction, errorEmbed("Échec nick", errorMessage(err)));
    }
  }

  // ────────────────────────────── /note
  @Slash({
    name: "note",
    description: "Ajouter une note interne mod (visible dans audit, pas sanction)",
  })
  async note(
    @SlashOption(
      {
        name: "membre",
        description: "Membre concerné",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "contenu",
      description: "Contenu de la note",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 500,
    })
    content: string,
    interaction: CommandInteraction,
  ) {
    await this.mod.note(target.id, interaction.user.id, content);
    await interaction.reply({
      embeds: [
        successEmbed(
          "📝 Note enregistrée",
          `Note interne ajoutée pour <@${target.id}>.\n\n> ${content}`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ────────────────────────────── /stats (membre)
  @Slash({ name: "stats", description: "Voir les stats modération d'un membre" })
  async stats(
    @SlashOption(
      {
        name: "membre",
        description: "Membre",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    target: User | undefined,
    interaction: CommandInteraction,
  ) {
    const user = target ?? interaction.user;
    const warnCount = await this.mod.countWarns(user.id);
    const jail = await this.mod.getActiveJail(user.id);
    const ban = await this.mod.getActiveBan(user.id);
    const clean = warnCount === 0 && !jail && !ban;
    const embed = brandedEmbed({
      title: `🛡️ Dossier modération — ${user.username}`,
      description: clean ? "Casier vierge." : `<@${user.id}>`,
      kind: clean ? "success" : "warning",
    })
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "Warns actifs", value: String(warnCount), inline: true },
        {
          name: "Jail",
          value: jail
            ? `Oui ${jail.expiresAt ? `(fin ${discordTime(jail.expiresAt, "R")})` : "(indéfini)"}`
            : "Non",
          inline: true,
        },
        { name: "Ban actif", value: ban ? "Oui" : "Non", inline: true },
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // ────────────────────────────── /sstats
  @Slash({ name: "sstats", description: "Stats du serveur" })
  async sstats(interaction: CommandInteraction) {
    if (!interaction.inCachedGuild()) return;
    const g = interaction.guild;
    const stats = await this.mod.statsWindow();
    const top3 =
      Object.entries(stats.byAction)
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([action, count]) => `\`${action}\` × ${count}`)
        .join(" · ") || "*aucune*";
    const embed = brandedEmbed({ title: `📊 Stats — ${g.name}`, kind: "brand" })
      .setThumbnail(g.iconURL() ?? null)
      .addFields(
        { name: "Membres", value: String(g.memberCount), inline: true },
        { name: "Canaux", value: String(g.channels.cache.size), inline: true },
        { name: "Rôles", value: String(g.roles.cache.size), inline: true },
        { name: "Boosts", value: String(g.premiumSubscriptionCount ?? 0), inline: true },
        { name: "Créé le", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "Mod (7j)", value: top3 },
      );
    await interaction.reply({ embeds: [embed] });
  }

  // ────────────────────────────── /role
  @Slash({
    name: "role",
    description: "Donner/retirer un rôle (ciblé ou global @everyone si admin)",
  })
  async role(
    @SlashChoice({ name: "give", value: "give" })
    @SlashChoice({ name: "remove", value: "remove" })
    @SlashOption({
      name: "action",
      description: "give/remove",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    action: "give" | "remove",
    @SlashOption({
      name: "role",
      description: "Rôle",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: import("discord.js").Role,
    @SlashOption(
      {
        name: "membre",
        description: "Cible (vide = @everyone si Administrator)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    target: User | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const botMember = await interaction.guild.members.fetchMe();
    if (role.position >= botMember.roles.highest.position) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "Rôle au-dessus du bot",
            `${role} (position ${role.position}) ≥ rôle bot. Replace le rôle du bot plus haut.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (target) {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) {
        await interaction.reply({
          embeds: [errorEmbed("Membre introuvable")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const allowed = await canManageRole(interaction.member, role, member);
      if (!allowed.ok) {
        await interaction.reply({
          embeds: [
            errorEmbed("Hiérarchie", allowed.reason ?? "Action interdite par la hiérarchie."),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      try {
        if (action === "give") await member.roles.add(role.id);
        else await member.roles.remove(role.id);
      } catch (err) {
        await interaction.reply({
          embeds: [errorEmbed("Échec rôle", (err as Error).message)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await this.mod.log("ROLE", target.id, interaction.user.id, undefined, {
        roleId: role.id,
        action,
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            action === "give" ? "Rôle donné" : "Rôle retiré",
            `${role} → <@${target.id}>`,
          ),
        ],
      });
    } else {
      // Bulk @everyone: Administrator only (as the option says), and the role
      // must sit below the invoker's highest role like a targeted change.
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await failInteraction(
          interaction,
          errorEmbed(
            "Réservé aux administrateurs",
            "Sans membre ciblé, `/role` agit sur tout le serveur : permission **Administrateur** requise.",
          ),
        );
        return;
      }
      const allowed = await canManageRole(interaction.member, role);
      if (!allowed.ok) {
        await failInteraction(
          interaction,
          errorEmbed("Hiérarchie", allowed.reason ?? "Action interdite par la hiérarchie."),
        );
        return;
      }
      await interaction.deferReply();
      // Beerus tourne sur [Guilds, GuildModeration] — pas d'intent GuildMembers.
      // Donc `role.members.cache` côté Beerus est vide ou quasi vide. On délègue
      // le fetch au client Grand Prêtre (intent GuildMembers privileged) puis on
      // exécute le PATCH via la REST de Beerus (audit log au nom de Beerus).
      const clients = container.resolve<Map<PersonaId, Client>>("ClientMap");
      const gp = clients.get("grandPretre");
      if (!gp || !gp.isReady()) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              "Grand Prêtre indisponible",
              "Le client `Grand Prêtre` (qui détient l'intent `GuildMembers`) n'est pas connecté. Vérifie son token et l'activation de l'intent `SERVER MEMBERS` sur le portail Discord.",
            ),
          ],
        });
        return;
      }
      const gpGuild =
        gp.guilds.cache.get(interaction.guildId) ??
        (await gp.guilds.fetch(interaction.guildId).catch(() => null));
      if (!gpGuild) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              "Guild introuvable côté Grand Prêtre",
              "Le client GP n'est pas membre de cette guild.",
            ),
          ],
        });
        return;
      }
      const allMembers = await gpGuild.members.fetch().catch((err) => {
        return { error: (err as Error).message } as const;
      });
      if ("error" in allMembers) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              "Échec fetch membres",
              `Grand Prêtre n'a pas pu lister les membres : ${allMembers.error}.\nVérifie que **SERVER MEMBERS INTENT** est activé sur le portail Discord pour Grand Prêtre.`,
            ),
          ],
        });
        return;
      }
      const targets =
        action === "remove"
          ? allMembers.filter((m) => m.roles.cache.has(role.id))
          : allMembers.filter((m) => !m.roles.cache.has(role.id) && !m.user.bot);
      if (targets.size === 0) {
        await interaction.editReply({
          embeds: [
            warningEmbed(
              action === "remove" ? "Aucun porteur" : "Aucune cible",
              action === "remove"
                ? `Aucun membre ne porte actuellement ${role}.`
                : `Tous les membres (non-bots) portent déjà ${role}.`,
            ),
          ],
        });
        return;
      }
      const scope = `${targets.size} membre(s) sur ${allMembers.size} (source : Grand Prêtre)`;
      const reason = `${action === "give" ? "give" : "remove"} bulk by ${interaction.user.username}`;
      let ok = 0;
      let failed = 0;
      // PATCH via REST Beerus pour que l'audit log Discord crédite Beerus.
      // PUT/DELETE /guilds/{guild}/members/{user}/roles/{role} — idempotent côté API.
      for (const m of targets.values()) {
        try {
          if (action === "give") {
            await interaction.client.rest.put(
              Routes.guildMemberRole(interaction.guildId, m.id, role.id),
              { reason },
            );
          } else {
            await interaction.client.rest.delete(
              Routes.guildMemberRole(interaction.guildId, m.id, role.id),
              { reason },
            );
          }
          ok++;
        } catch {
          failed++;
        }
      }
      await this.mod.log("ROLE_BULK", null, interaction.user.id, undefined, {
        roleId: role.id,
        action,
        ok,
        failed,
        scope,
      });
      // A large guild can outlive the 15 min interaction token: the log above stays.
      await interaction
        .editReply({
          embeds: [
            successEmbed(
              action === "give" ? "Rôle donné en masse" : "Rôle retiré en masse",
              `${role} ${action === "give" ? "ajouté à" : "retiré de"} **${ok}** membre(s)${failed ? ` (${failed} échec(s))` : ""}.\n*Scope : ${scope}.*`,
            ),
          ],
        })
        .catch(() => {});
    }
  }
}
