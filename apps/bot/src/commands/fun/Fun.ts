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
import { logger } from "~/lib/logger";

/**
 * Helper: % aléatoire stable par jour et par user (déterministe dans la journée).
 * Comme ça /gay sur la même cible renvoie le même % tant que c'est le même jour.
 */
function stablePercent(userId: string, salt: string): number {
  const today = Math.floor(Date.now() / 86_400_000);
  let h = 2166136261;
  for (const ch of `${userId}:${salt}:${today}`) {
    h ^= ch.charCodeAt(0);
    h = (h * 16777619) >>> 0;
  }
  return h % 101;
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@injectable()
export class FunCommands {
  constructor(@inject(GaugeService) private gauge: GaugeService) {}

  /** Renders the gauge card; a canvas failure ends the deferred reply instead of hanging it. */
  private async sendGauge(
    interaction: CommandInteraction,
    target: User,
    fileName: string,
    opts: Omit<Parameters<GaugeService["render"]>[0], "user">,
  ) {
    try {
      const buf = await this.gauge.render({ user: target, ...opts });
      await interaction.editReply({
        content: `${target}`,
        files: [new AttachmentBuilder(buf, { name: fileName })],
      });
    } catch (err) {
      logger.warn({ err, fileName }, "fun gauge render failed");
      await interaction
        .editReply({ embeds: [errorEmbed("Scanner en panne", "Réessaie dans un instant.")] })
        .catch(() => {});
    }
  }

  @Slash({ name: "gay", description: "% aléatoire de gaytitude (fun)" })
  async gay(
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
    await interaction.deferReply();
    const pct = isBotOwner(target.id) ? 0 : stablePercent(target.id, "gay");
    await this.sendGauge(interaction, target, "gaydar.png", {
      title: "GAYDAR DE BULMA",
      subtitle: "Scanner calibré sur Master Roshi",
      pct,
      accent: "#ec4899",
      accentDark: "#3a0420",
    });
  }

  @Slash({ name: "raciste", description: "% aléatoire de racisme (fun)" })
  async raciste(
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
    await interaction.deferReply();
    // Spec : si utilisée sur l'owner → 101 % (overflow rouge)
    const pct = isBotOwner(target.id) ? 101 : stablePercent(target.id, "raciste");
    await this.sendGauge(interaction, target, "racism-o-metre.png", {
      title: "RACISM-O-MÈTRE",
      subtitle: "Scanner calibré sur Commander Red",
      pct,
      accent: "#dc2626",
      accentDark: "#4a0000",
    });
  }
}
