import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashOption } from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  type CommandInteraction,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { isBotOwner } from "~/lib/env";
import { GaugeService } from "~/services/GaugeService";
import { errorEmbed } from "~/lib/embeds";
import { discordLocalizations, interactionLang, t, type BotLang } from "~/lib/i18n";
import { logger } from "~/lib/logger";

/**
 * Helper: % aléatoire stable par jour et par user (déterministe dans la journée).
 * Comme ça /saiyan sur la même cible renvoie le même % tant que c'est le même jour.
 */
export function stablePercent(userId: string, salt: string): number {
  const today = Math.floor(Date.now() / 86_400_000);
  let h = 2166136261;
  for (const ch of `${userId}:${salt}:${today}`) {
    h ^= ch.charCodeAt(0);
    h = (h * 16777619) >>> 0;
  }
  return h % 101;
}

/** The two Dragon Ball gauges: texts from `commands.<kind>`, colours of the scouter card. */
export const FUN_GAUGES = {
  saiyan: { accent: "#f59e0b", accentDark: "#3a2304", owner: 101 },
  villain: { accent: "#a855f7", accentDark: "#25073d", owner: 0 },
} as const;

export type FunGauge = keyof typeof FUN_GAUGES;

/** Gauge texts and colours in `lang` (the canvas API and the commands draw the same card). */
export function funGaugeStyle(kind: FunGauge, lang: BotLang) {
  const { accent, accentDark } = FUN_GAUGES[kind];
  return {
    title: t(lang, `commands.${kind}.title`),
    subtitle: t(lang, `commands.${kind}.subtitle`),
    badge: t(lang, "commands.gauge.badge"),
    caption: t(lang, "commands.gauge.caption"),
    accent,
    accentDark,
  };
}

/** Percentage shown for `userId`: stable over the day; the owner gets the gauge's joke value. */
export function funGaugePercent(kind: FunGauge, userId: string): number {
  return isBotOwner(userId) ? FUN_GAUGES[kind].owner : stablePercent(userId, kind);
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@injectable()
export class FunCommands {
  constructor(@inject(GaugeService) private gauge: GaugeService) {}

  /** Renders the gauge card; a canvas failure ends the deferred reply instead of hanging it. */
  private async sendGauge(interaction: CommandInteraction, target: User, kind: FunGauge) {
    const lang = interactionLang(interaction);
    await interaction.deferReply();
    try {
      const buf = await this.gauge.render({
        user: target,
        pct: funGaugePercent(kind, target.id),
        ...funGaugeStyle(kind, lang),
      });
      await interaction.editReply({
        content: `${target}`,
        files: [new AttachmentBuilder(buf, { name: `${kind}.png` })],
      });
    } catch (err) {
      logger.warn({ err, kind }, "fun gauge render failed");
      await interaction
        .editReply({
          embeds: [
            errorEmbed(t(lang, "commands.gauge.failedTitle"), t(lang, "commands.gauge.failedBody")),
          ],
        })
        .catch(() => {});
    }
  }

  @Slash({
    name: "saiyan",
    description: t("en", "commands.saiyan.description"),
    nameLocalizations: discordLocalizations("commands.saiyan.name"),
    descriptionLocalizations: discordLocalizations("commands.saiyan.description"),
  })
  async saiyan(
    @SlashOption(
      {
        name: "member",
        description: t("en", "commands.saiyan.memberDescription"),
        nameLocalizations: discordLocalizations("commands.saiyan.member"),
        descriptionLocalizations: discordLocalizations("commands.saiyan.memberDescription"),
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    interaction: CommandInteraction,
  ) {
    await this.sendGauge(interaction, target, "saiyan");
  }

  @Slash({
    name: "villain",
    description: t("en", "commands.villain.description"),
    nameLocalizations: discordLocalizations("commands.villain.name"),
    descriptionLocalizations: discordLocalizations("commands.villain.description"),
  })
  async villain(
    @SlashOption(
      {
        name: "member",
        description: t("en", "commands.villain.memberDescription"),
        nameLocalizations: discordLocalizations("commands.villain.member"),
        descriptionLocalizations: discordLocalizations("commands.villain.memberDescription"),
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    interaction: CommandInteraction,
  ) {
    await this.sendGauge(interaction, target, "villain");
  }
}
