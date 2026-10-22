import { injectable, inject } from "tsyringe";
import {
  Bot,
  ButtonComponent,
  Discord,
  Guard,
  ModalComponent,
  Slash,
  SlashChoice,
  SlashOption,
} from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type CommandInteraction,
  type ModalSubmitInteraction,
  type Role,
  type TextChannel,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { AdminOnly } from "~/guards/AdminOnly";
import { FeatureEnabled } from "~/guards/FeatureEnabled";
import { TicketService } from "~/services/TicketService";
import {
  SettingsService,
  TICKET_KIND_LABELS,
  TICKET_KINDS,
  type TicketKind,
} from "~/services/SettingsService";
import { LogService } from "~/services/LogService";
import { brandedEmbed, errorEmbed, successEmbed, warningEmbed } from "~/lib/embeds";
import { logger } from "~/lib/logger";

/** Question de la modal d'ouverture : une candidature staff demande une présentation. */
const CONTEXT_PROMPT: Record<TicketKind, string> = {
  report: "Que voulez-vous signaler ?",
  achat: "Contexte (décrivez votre demande)",
  shop: "Contexte (décrivez votre demande)",
  abus: "Que s'est-il passé ?",
  staff: "Présentation, motivations, disponibilités",
};

const isTicketKind = (value: string): value is TicketKind =>
  (TICKET_KINDS as readonly string[]).includes(value);

@Discord()
@Bot("shenron")
@Guard(GuildOnly, FeatureEnabled("features.tickets", "Le système de tickets"))
@injectable()
export class TicketCommands {
  constructor(
    @inject(TicketService) private tickets: TicketService,
    @inject(LogService) private logs: LogService,
    @inject(SettingsService) private settings: SettingsService,
  ) {}

  // Admin : publier le panel
  @Slash({
    name: "ticket-panel",
    description: "Publier le panel de tickets",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @Guard(AdminOnly)
  async publishPanel(interaction: CommandInteraction) {
    const embed = brandedEmbed({
      title: "🎫 Ouvrir un ticket",
      description:
        "Cliquez sur le bouton correspondant à votre besoin. Un salon privé sera créé avec l'équipe.",
      footer: "Un ticket ouvert par type et par membre",
      timestamp: false,
    }).addFields(
      { name: "🚨 Signaler", value: "Signaler un comportement", inline: true },
      { name: "🛒 Achat", value: "Question sur un achat", inline: true },
      { name: "🏪 Shop", value: "Problème shop / custom", inline: true },
      { name: "⚠️ Abus de perm", value: "Rapport staff", inline: true },
      { name: "📝 Candidature staff", value: "Rejoindre l'équipe", inline: true },
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:open:report")
        .setLabel("Signaler")
        .setEmoji("🚨")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("ticket:open:achat")
        .setLabel("Achat")
        .setEmoji("🛒")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ticket:open:shop")
        .setLabel("Shop")
        .setEmoji("🏪")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket:open:abus")
        .setLabel("Abus de perm")
        .setEmoji("⚠️")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("ticket:open:staff")
        .setLabel(TICKET_KIND_LABELS.staff)
        .setEmoji("📝")
        .setStyle(ButtonStyle.Success),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  // Bouton Ouvrir → affiche la modal de contexte
  @ButtonComponent({ id: /^ticket:open:[a-z]+$/ })
  async openModal(interaction: ButtonInteraction) {
    const kind = interaction.customId.split(":")[2] ?? "";
    if (!isTicketKind(kind)) return;
    const modal = new ModalBuilder()
      .setCustomId(`ticket:submit:${kind}`)
      .setTitle(`Ticket — ${TICKET_KIND_LABELS[kind]}`);
    const input = new TextInputBuilder()
      .setCustomId("context")
      .setLabel(CONTEXT_PROMPT[kind])
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1500);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
  }

  // Soumission modal → création du ticket
  @ModalComponent({ id: /^ticket:submit:[a-z]+$/ })
  async submitModal(interaction: ModalSubmitInteraction) {
    if (!interaction.guild) return;
    const kind = interaction.customId.split(":")[2] ?? "";
    if (!isTicketKind(kind)) return;
    const context = interaction.fields.getTextInputValue("context");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // One open ticket per member and type: a double click on the panel used
    // to create two channels.
    const existing = await this.tickets.findOpenForOwner(
      interaction.guild,
      interaction.user.id,
      kind,
    );
    if (existing) {
      await interaction.editReply({
        embeds: [
          warningEmbed(
            "Ticket déjà ouvert",
            `Tu as déjà un ticket **${TICKET_KIND_LABELS[kind]}** en cours : <#${existing.channelId}>.`,
          ),
        ],
      });
      return;
    }

    let channel: TextChannel;
    try {
      channel = await this.tickets.create(interaction.guild, interaction.user.id, kind, context);
    } catch (err) {
      logger.warn({ err, kind }, "ticket: create failed");
      await interaction
        .editReply({
          embeds: [
            errorEmbed(
              "Ticket non créé",
              "Le salon n'a pas pu être créé (catégorie pleine ou permissions du bot). Préviens l'équipe.",
            ),
          ],
        })
        .catch(() => {});
      return;
    }
    await interaction.editReply({
      embeds: [successEmbed("Ticket créé", `Rendez-vous dans ${channel}.`)],
    });

    // Notif mod
    const embed = this.logs
      .makeEmbed(`Nouveau ticket — ${TICKET_KIND_LABELS[kind]}`, 0xff9800)
      .addFields(
        { name: "Ouvert par", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Salon", value: `${channel}`, inline: true },
        { name: "Contexte", value: context.slice(0, 1024) },
      );
    await this.logs.send(interaction.client, "modNotify", embed);
    await this.logs.send(interaction.client, "ticket", embed);
  }

  // Bouton Fermer dans le ticket
  @ButtonComponent({ id: "ticket:close" })
  async closeButton(interaction: ButtonInteraction) {
    await this.closeTicket(interaction);
  }

  private async closeTicket(interaction: ButtonInteraction | CommandInteraction) {
    if (!interaction.channel || !interaction.guild) return;
    const channel = interaction.channel as TextChannel;
    const ticket = await this.tickets.findByChannel(channel.id);
    if (!ticket) {
      await interaction.reply({
        embeds: [errorEmbed("Pas un ticket", "Ce salon n'est pas un ticket.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (ticket.closed) {
      // Closed but still there: the delayed deletion was lost (bot restart).
      await interaction.reply({
        embeds: [warningEmbed("Ticket déjà fermé", "Suppression du salon restant…")],
        flags: MessageFlags.Ephemeral,
      });
      await channel.delete("ticket already closed").catch(() => {});
      return;
    }
    const ok = await this.tickets.close(channel.id, interaction.user.id);
    if (!ok) {
      await interaction.reply({
        embeds: [warningEmbed("Ticket déjà fermé", "Un autre membre vient de le fermer.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const closeDelayMs = await this.settings
      .getInt("game.ticket.close_delay_ms", 10_000)
      .catch(() => 10_000);
    const closeSec = Math.round(closeDelayMs / 1000);
    await interaction.reply({
      embeds: [
        brandedEmbed({
          title: "🔒 Ticket fermé",
          description: `Fermé par <@${interaction.user.id}>. Suppression du salon dans **${closeSec} s**.`,
          kind: "muted",
        }),
      ],
    });
    setTimeout(() => {
      void channel.delete(`ticket closed by ${interaction.user.username}`).catch(() => {});
    }, closeDelayMs);

    const embed = this.logs.makeEmbed("Ticket fermé", 0x6b7280).addFields(
      { name: "Fermé par", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Ouvert par", value: `<@${ticket.ownerId}>`, inline: true },
      {
        name: "Type",
        value: isTicketKind(ticket.kind) ? TICKET_KIND_LABELS[ticket.kind] : ticket.kind,
        inline: true,
      },
      { name: "Salon", value: `#${channel.name}` },
    );
    await this.logs.send(interaction.client, "ticket", embed);
  }

  // /close
  @Slash({ name: "close", description: "Fermer le ticket courant" })
  async close(interaction: CommandInteraction) {
    if (!interaction.channel) return;
    await this.closeTicket(interaction);
  }

  // /ticket add / remove
  @Slash({ name: "ticket", description: "Ajouter/retirer quelqu'un du ticket courant" })
  async manage(
    @SlashChoice({ name: "add", value: "add" })
    @SlashChoice({ name: "remove", value: "remove" })
    @SlashOption({
      name: "action",
      description: "add/remove",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    action: "add" | "remove",
    @SlashOption(
      {
        name: "utilisateur",
        description: "Utilisateur",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    user: User | undefined,
    @SlashOption({
      name: "role",
      description: "Rôle",
      type: ApplicationCommandOptionType.Role,
      required: false,
    })
    role: Role | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guild || !interaction.channel) return;
    const t = await this.tickets.findByChannel(interaction.channel.id);
    if (!t) {
      await interaction.reply({
        content: "Utilisable uniquement dans un ticket.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const targetId = user?.id ?? role?.id;
    if (!targetId) {
      await interaction.reply({
        content: "Spécifiez un utilisateur ou un rôle.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const mention = user ? `<@${targetId}>` : `<@&${targetId}>`;
    let done: boolean;
    try {
      done =
        action === "add"
          ? await this.tickets.addUser(interaction.guild, interaction.channel.id, targetId)
          : await this.tickets.removeUser(interaction.guild, interaction.channel.id, targetId);
    } catch (err) {
      logger.warn({ err, action, targetId }, "ticket: permission overwrite failed");
      done = false;
    }
    if (!done) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "Action refusée",
            action === "remove" && targetId === t.ownerId
              ? "Impossible de retirer l'auteur du ticket."
              : `Impossible de modifier l'accès de ${mention} à ce ticket.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      embeds: [
        successEmbed(
          action === "add" ? "Accès ajouté" : "Accès retiré",
          `${mention} ${action === "add" ? "peut maintenant voir" : "ne voit plus"} ce ticket.`,
        ),
      ],
      allowedMentions: { parse: [] },
    });
  }
}
