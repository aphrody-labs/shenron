import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  MessageFlags,
  type CommandInteraction,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { DatabaseService } from "~/db/index";
import { invitesLog } from "~/db/schema";
import { userTransformer } from "~/lib/slash-user";
import { brandedEmbed } from "~/lib/embeds";
import { and, desc, eq, gte, sql } from "drizzle-orm";

/**
 * `/invitations [@user]` — affiche les stats d'invitations Discord :
 * - nombre total d'invités par cette personne
 * - 5 plus récents
 * - nombre sur 7 jours
 * - première invitation
 *
 * Géré par Whis (utility). Backed par la table `invites_log` alimentée
 * par `JoinLeave.onJoin` via `InviteTracker.detectInviter`.
 */
@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@injectable()
export class InvitationsCommand {
  constructor(@inject(DatabaseService) private dbs: DatabaseService) {}

  @Slash({ name: "invitations", description: "Voir qui un membre a invité" })
  async invitations(
    @SlashOption(
      {
        name: "membre",
        description: "Cible (défaut : toi)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    target: User | undefined,
    interaction: CommandInteraction,
  ) {
    const user = target ?? interaction.user;
    const db = this.dbs.db;

    const [totalRow] = await db
      .select({ c: sql<number>`count(*)` })
      .from(invitesLog)
      .where(eq(invitesLog.inviterId, user.id));
    const total = Number(totalRow?.c ?? 0);

    if (total === 0) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            title: "📨 Invitations",
            description: `<@${user.id}> n'a encore invité personne (depuis l'activation du suivi).`,
            kind: "muted",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const since7d = new Date(Date.now() - 7 * 86_400_000);
    const [weekRow] = await db
      .select({ c: sql<number>`count(*)` })
      .from(invitesLog)
      .where(and(eq(invitesLog.inviterId, user.id), gte(invitesLog.joinedAt, since7d)));
    const week = Number(weekRow?.c ?? 0);

    const recent = await db
      .select()
      .from(invitesLog)
      .where(eq(invitesLog.inviterId, user.id))
      .orderBy(desc(invitesLog.joinedAt))
      .limit(5);

    const first = await db
      .select()
      .from(invitesLog)
      .where(eq(invitesLog.inviterId, user.id))
      .orderBy(invitesLog.joinedAt)
      .limit(1);
    const firstTs = first[0]?.joinedAt;

    const recentLines = recent
      .map(
        (r) =>
          `• <@${r.userId}> · <t:${Math.floor(r.joinedAt.getTime() / 1000)}:R> · code \`${r.code ?? "?"}\``,
      )
      .join("\n");

    const embed = brandedEmbed({
      title: `📨 Invitations — ${user.username}`,
      kind: "info",
      footer: "Suivi depuis l'activation · lien vanity non suivi",
    })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Total", value: `**${total}** membre(s) invité(s)`, inline: true },
        { name: "7 derniers jours", value: `**${week}**`, inline: true },
        {
          name: "Première invitation",
          value: firstTs ? `<t:${Math.floor(firstTs.getTime() / 1000)}:R>` : "—",
          inline: true,
        },
        { name: "5 plus récents", value: recentLines || "—" },
      );

    await interaction.reply({ embeds: [embed] });
  }

  @Slash({ name: "inviteur", description: "Voir qui a invité un membre" })
  async inviter(
    @SlashOption(
      {
        name: "membre",
        description: "Membre dont on cherche l'inviteur",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    interaction: CommandInteraction,
  ) {
    const row = await this.dbs.db
      .select()
      .from(invitesLog)
      .where(eq(invitesLog.userId, target.id))
      .orderBy(desc(invitesLog.joinedAt))
      .limit(1);

    if (row.length === 0 || !row[0]) {
      await interaction.reply({
        embeds: [
          brandedEmbed({
            title: `🔍 Inviteur de ${target.username}`,
            description: `Aucune donnée pour <@${target.id}> (arrivé avant l'activation du suivi, ou par le lien vanity).`,
            kind: "muted",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const entry = row[0];
    const embed = brandedEmbed({ title: `🔍 Inviteur de ${target.username}`, kind: "success" })
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Membre", value: `<@${target.id}>`, inline: true },
        {
          name: "Invité par",
          value: entry.inviterId ? `<@${entry.inviterId}>` : "Inconnu (vanity / non tracké)",
          inline: true,
        },
        {
          name: "Code",
          value: entry.code ? `\`${entry.code}\`` : "—",
          inline: true,
        },
        {
          name: "Rejoint",
          value: `<t:${Math.floor(entry.joinedAt.getTime() / 1000)}:F>`,
          inline: false,
        },
      );

    await interaction.reply({ embeds: [embed] });
  }
}
