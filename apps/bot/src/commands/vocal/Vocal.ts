import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  ChannelType,
  MessageFlags,
  type CommandInteraction,
  type EmbedBuilder,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { VocalTempoService } from "~/services/VocalTempoService";
import { errorEmbed, successEmbed } from "~/lib/embeds";

@Discord()
@Bot("shenron")
@Guard(GuildOnly)
@injectable()
export class VocalCommands {
  constructor(@inject(VocalTempoService) private vts: VocalTempoService) {}

  private async refuse(interaction: CommandInteraction, embed: EmbedBuilder) {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "voc", description: "Gérer votre vocal temporaire" })
  async voc(
    @SlashChoice({ name: "kick", value: "kick" })
    @SlashChoice({ name: "ban", value: "ban" })
    @SlashChoice({ name: "unban", value: "unban" })
    @SlashOption({
      name: "action",
      description: "kick/ban/unban",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    action: "kick" | "ban" | "unban",
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
    if (!interaction.inCachedGuild()) return;
    const channel = interaction.member.voice?.channel;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await this.refuse(
        interaction,
        errorEmbed("Pas en vocal", "Tu dois être dans ton vocal temporaire."),
      );
      return;
    }
    const ownerId = await this.vts.ownerOf(channel.id);
    if (!ownerId) {
      await this.refuse(
        interaction,
        errorEmbed("Vocal permanent", "Ce salon n'est pas un vocal temporaire."),
      );
      return;
    }
    if (ownerId !== interaction.user.id) {
      await this.refuse(
        interaction,
        errorEmbed("Pas ton vocal", `Seul <@${ownerId}> peut gérer ce vocal.`),
      );
      return;
    }
    // The owner keeps their own vocal; the bot must stay able to manage it.
    if (target.id === interaction.user.id || target.id === interaction.client.user.id) {
      await this.refuse(
        interaction,
        errorEmbed("Cible invalide", "Choisis un autre membre que toi ou le bot."),
      );
      return;
    }
    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (action === "kick") {
      if (targetMember?.voice.channelId !== channel.id) {
        await this.refuse(
          interaction,
          errorEmbed("Absent du vocal", `${target} n'est pas dans ton vocal.`),
        );
        return;
      }
      await targetMember.voice.disconnect("kick voc tempo").catch(() => {});
      await interaction.reply({
        embeds: [successEmbed("Expulsé du vocal", `👢 ${target} a été déconnecté de ${channel}.`)],
      });
      return;
    }
    if (action === "ban") {
      await this.vts.banUser(interaction.user.id, target.id);
      await channel.permissionOverwrites.edit(target.id, { Connect: false }).catch(() => {});
      if (targetMember?.voice.channelId === channel.id)
        await targetMember.voice.disconnect("voc tempo ban").catch(() => {});
      await interaction.reply({
        embeds: [
          successEmbed(
            "Banni du vocal",
            `🚫 ${target} ne peut plus rejoindre tes vocaux temporaires.`,
          ),
        ],
      });
      return;
    }
    await this.vts.unbanUser(interaction.user.id, target.id);
    await channel.permissionOverwrites.delete(target.id).catch(() => {});
    await interaction.reply({
      embeds: [successEmbed("Débanni du vocal", `✅ ${target} peut de nouveau rejoindre.`)],
    });
  }
}
