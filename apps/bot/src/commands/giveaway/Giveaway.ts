import { injectable, inject } from "tsyringe";
import { Bot, ButtonComponent, Discord, Guard, Once, Slash, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Client,
  type CommandInteraction,
  type TextChannel,
} from "discord.js";
import { and, count, eq, lte } from "drizzle-orm";
import { GuildOnly } from "~/guards/GuildOnly";
import { ModOnly } from "~/guards/ModOnly";
import { FeatureEnabled } from "~/guards/FeatureEnabled";
import { DatabaseService } from "~/db/index";
import { giveaways, giveawayEntries } from "~/db/schema";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { CronRegistry } from "~/api/cron-registry";
import { COLORS } from "~/lib/embeds";
import { logger } from "~/lib/logger";

/** Durée la plus longue acceptée : au-delà, `Date` déborde ou le tirage n'a plus de sens. */
const MAX_DURATION_MS = 365 * 86_400_000;

function parseDuration(input: string): number | undefined {
  const m = input.trim().match(/^(\d+)\s*([smhdw])$/i);
  if (!m) return undefined;
  const n = parseInt(m[1]!, 10);
  const mult =
    { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2]!.toLowerCase()] ?? 0;
  const ms = n * mult;
  return ms > 0 && ms <= MAX_DURATION_MS ? ms : undefined;
}

type GiveawayRow = typeof giveaways.$inferSelect;

function giveawayEmbed(
  gw: Pick<GiveawayRow, "title" | "reward" | "description" | "winners" | "endsAt">,
  state: { entrants: number; winnerIds?: string[] | null },
): EmbedBuilder {
  const ended = state.winnerIds !== undefined && state.winnerIds !== null;
  const end = `<t:${Math.floor(gw.endsAt.getTime() / 1000)}:${ended ? "f" : "R"}>`;
  const lines = [
    gw.description ?? "",
    "",
    `**Récompense** : ${gw.reward}`,
    `**Gagnants** : ${gw.winners}`,
    `**Participants** : ${state.entrants}`,
    `**${ended ? "Terminé" : "Fin"}** : ${end}`,
  ];
  if (ended) {
    lines.push(
      "",
      state.winnerIds!.length
        ? `🏆 ${state.winnerIds!.map((id) => `<@${id}>`).join(", ")}`
        : "*Aucun participant.*",
    );
  } else {
    lines.push("", "Clique sur le bouton pour participer.");
  }
  return new EmbedBuilder()
    .setTitle(`🎁 ${gw.title}`)
    .setDescription(lines.join("\n").trim())
    .setColor(ended ? COLORS.muted : COLORS.brand)
    .setTimestamp(gw.endsAt);
}

function enterRow(disabled: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway:enter")
      .setLabel(disabled ? "Terminé" : "Participer")
      .setEmoji("🎉")
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, FeatureEnabled("features.giveaway", "Le système de giveaway"))
@injectable()
export class GiveawayCommands {
  constructor(@inject(DatabaseService) private dbs: DatabaseService) {}

  @Slash({
    name: "giveaway",
    description: "Créer un giveaway",
    defaultMemberPermissions: PermissionFlagsBits.ManageEvents,
  })
  @Guard(ModOnly)
  async create(
    @SlashOption({
      name: "titre",
      description: "Titre",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    title: string,
    @SlashOption({
      name: "recompense",
      description: "Récompense",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    reward: string,
    @SlashOption({
      name: "gagnants",
      description: "Nombre de gagnants",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
      maxValue: 20,
    })
    winners: number,
    @SlashOption({
      name: "duree",
      description: "Durée (ex: 1h, 1d)",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    duration: string,
    @SlashOption({
      name: "salon",
      description: "Salon de publication",
      type: ApplicationCommandOptionType.Channel,
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      required: false,
    })
    channel: TextChannel | undefined,
    @SlashOption({
      name: "description",
      description: "Description",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    description: string | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const ms = parseDuration(duration);
    if (!ms) {
      await interaction.reply({
        content: "Durée invalide (ex: 30m, 1h, 2d ; un an au plus).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const ch = channel ?? (interaction.channel as TextChannel | null);
    if (!ch || typeof ch.send !== "function") {
      await interaction.reply({
        content: "Ce salon ne peut pas recevoir de giveaway.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const endsAt = new Date(Date.now() + ms);
    const draft = { title, reward, description: description ?? null, winners, endsAt };

    // Un salon sans permission d'écriture faisait échouer la commande sans réponse.
    const msg = await ch
      .send({ embeds: [giveawayEmbed(draft, { entrants: 0 })], components: [enterRow(false)] })
      .catch((err) => {
        logger.warn({ err, channelId: ch.id }, "giveaway publish failed");
        return null;
      });
    if (!msg) {
      await interaction.editReply({ content: `❌ Impossible de publier dans ${ch}.` });
      return;
    }
    await this.dbs.db.insert(giveaways).values({
      ...draft,
      messageId: msg.id,
      channelId: ch.id,
      hostId: interaction.user.id,
    });
    await interaction.editReply({ content: `✅ Giveaway publié dans ${ch}.` });
  }

  @ButtonComponent({ id: "giveaway:enter" })
  async enter(interaction: ButtonInteraction) {
    if (!interaction.message) return;
    const gw = await this.dbs.db.query.giveaways.findFirst({
      where: eq(giveaways.messageId, interaction.message.id),
    });
    // Échu mais pas encore tiré (le tirage passe chaque minute) : déjà fermé.
    if (!gw || gw.ended || gw.endsAt.getTime() <= Date.now()) {
      await interaction.reply({ content: "Giveaway terminé.", flags: MessageFlags.Ephemeral });
      return;
    }
    const inserted = await this.dbs.db
      .insert(giveawayEntries)
      .values({ giveawayId: gw.id, userId: interaction.user.id })
      .onConflictDoNothing()
      .returning({ id: giveawayEntries.id });
    const [row] = await this.dbs.db
      .select({ n: count() })
      .from(giveawayEntries)
      .where(eq(giveawayEntries.giveawayId, gw.id));
    const entrants = Number(row?.n ?? 0);
    await interaction.reply({
      content: inserted.length
        ? `🎉 Participation enregistrée ! (${entrants} participant${entrants > 1 ? "s" : ""})`
        : "Tu participes déjà.",
      flags: MessageFlags.Ephemeral,
    });
    if (inserted.length) {
      await interaction.message.edit({ embeds: [giveawayEmbed(gw, { entrants })] }).catch(() => {});
    }
  }
}

@Discord()
@Bot("shenron")
@injectable()
export class GiveawayTicker {
  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(MessageTemplateService) private msg: MessageTemplateService,
    @inject(CronRegistry) private cron: CronRegistry,
  ) {}

  @Once({ event: "clientReady" })
  async start([client]: [Client]) {
    this.cron.register({
      name: "giveaway-ticker",
      description: "Tirage au sort automatique des giveaways expirés",
      owner: "giveaways",
      category: "periodic",
      idempotent: true,
      duplicateBehavior: "skip",
      intervalMs: 60_000,
      fn: () => this.tick(client),
    });
  }

  async tick(client: Client) {
    const now = new Date();
    const ready = await this.dbs.db
      .select()
      .from(giveaways)
      .where(and(eq(giveaways.ended, false), lte(giveaways.endsAt, now)));
    for (const gw of ready) {
      // Clôture réclamée d'abord : un tirage ne peut pas être joué deux fois.
      const claimed = await this.dbs.db
        .update(giveaways)
        .set({ ended: true })
        .where(and(eq(giveaways.id, gw.id), eq(giveaways.ended, false)))
        .returning({ id: giveaways.id });
      if (claimed.length === 0) continue;

      const entries = await this.dbs.db
        .select()
        .from(giveawayEntries)
        .where(eq(giveawayEntries.giveawayId, gw.id));
      const picked: string[] = [];
      const pool = entries.map((e) => e.userId);
      const n = Math.min(gw.winners, pool.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]!);
      }
      await this.dbs.db
        .update(giveaways)
        .set({ winnerIds: JSON.stringify(picked) })
        .where(eq(giveaways.id, gw.id));

      const channel = (await client.channels
        .fetch(gw.channelId)
        .catch(() => null)) as TextChannel | null;
      // Le message d'origine affiche le résultat et son bouton se désactive :
      // il restait cliquable et répondait « terminé » sans rien montrer.
      const original = await channel?.messages.fetch(gw.messageId).catch(() => null);
      await original
        ?.edit({
          embeds: [giveawayEmbed(gw, { entrants: entries.length, winnerIds: picked })],
          components: [enterRow(true)],
        })
        .catch(() => {});

      // Annonce templatable (channel.giveaway) si gagnants — sinon fallback dans
      // le salon d'origine du giveaway pour signaler l'absence de participants.
      if (picked.length) {
        const target = await this.msg.resolveTarget("giveaway_winner", client);
        if (target?.enabled !== false) {
          const published = await this.msg.publish(
            "giveaway_winner",
            {
              winners: picked.map((id) => `<@${id}>`).join(" "),
              prize: gw.reward,
              title: gw.title,
            },
            client,
          );
          if (!published) {
            await channel
              ?.send({
                content: `🎉 Résultat du giveaway **${gw.title}**\nGagnant${picked.length > 1 ? "s" : ""} : ${picked.map((id) => `<@${id}>`).join(", ")}\nRécompense : ${gw.reward}`,
              })
              .catch(() => {});
          }
        }
      } else {
        await channel
          ?.send({ content: `😔 Giveaway **${gw.title}** terminé sans participants.` })
          .catch(() => {});
      }
    }
  }
}
