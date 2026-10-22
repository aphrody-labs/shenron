import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionFlagsBits,
  type CommandInteraction,
  type EmbedBuilder,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { AchievementService } from "~/services/AchievementService";
import { brandedEmbed, errorEmbed, successEmbed, truncate, warningEmbed } from "~/lib/embeds";

/**
 * Regex flags accepted for a trigger. `g` and `y` are refused: they make `RegExp.test`
 * stateful (`lastIndex`), so a shared compiled trigger would skip every other match.
 * Returns the error to show, or `null` when the pattern compiles.
 */
export function validateTriggerRegex(pattern: string, flags: string | undefined): string | null {
  const f = flags ?? "i";
  if (!/^[dimsuv]*$/.test(f) || new Set(f).size !== f.length) {
    return `Flags invalides : \`${f}\` (autorisés : d, i, m, s, u, v, sans doublon).`;
  }
  try {
    RegExp(pattern, f);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

const notFound = (code: string) => errorEmbed("Trigger introuvable", `Aucun trigger \`${code}\`.`);

@Discord()
@Bot("shenron")
@Guard(GuildOnly)
@SlashGroup({
  name: "succes",
  description: "Admin: gestion des succès auto-déclenchés",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
@SlashGroup("succes")
@injectable()
export class AchievementAdmin {
  constructor(@inject(AchievementService) private ach: AchievementService) {}

  private async replyEphemeral(interaction: CommandInteraction, embed: EmbedBuilder) {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  @Slash({ name: "set", description: "Créer ou éditer un trigger de succès" })
  async set(
    @SlashOption({
      name: "code",
      description: "Code du succès (ex: KAMEHAMEHA)",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 64,
    })
    code: string,
    @SlashOption({
      name: "pattern",
      description: "Regex JavaScript à matcher dans les messages",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 500,
    })
    pattern: string,
    @SlashOption({
      name: "description",
      description: "Description visible dans /succes list",
      type: ApplicationCommandOptionType.String,
      required: false,
      maxLength: 200,
    })
    description: string | undefined,
    @SlashOption({
      name: "flags",
      description: "Flags regex (défaut: i ; g et y refusés)",
      type: ApplicationCommandOptionType.String,
      required: false,
      maxLength: 8,
    })
    flags: string | undefined,
    interaction: CommandInteraction,
  ) {
    const invalid = validateTriggerRegex(pattern, flags);
    if (invalid) {
      await this.replyEphemeral(interaction, errorEmbed("Regex invalide", invalid));
      return;
    }
    await this.ach.upsert({ code, pattern, description, flags });
    await this.replyEphemeral(
      interaction,
      successEmbed(
        `Trigger \`${code}\` enregistré`,
        `Pattern : \`/${pattern}/${flags ?? "i"}\`\nDescription : ${description ?? "*(n/a)*"}`,
      ),
    );
  }

  @Slash({ name: "list", description: "Lister tous les triggers" })
  async list(interaction: CommandInteraction) {
    const list = await this.ach.list();
    if (list.length === 0) {
      await this.replyEphemeral(
        interaction,
        brandedEmbed({
          title: "Triggers de succès",
          description: "*(aucun trigger configuré — `/succes set` pour en créer un)*",
          kind: "muted",
        }),
      );
      return;
    }
    const sorted = list.toSorted((a, b) => a.code.localeCompare(b.code));
    const shown = sorted.slice(0, 25);
    const active = list.filter((t) => t.enabled).length;
    const embed = brandedEmbed({
      title: `Triggers de succès (${active} actifs / ${list.length})`,
      description: shown
        .map(
          (t) =>
            `**\`${t.code}\`** ${t.enabled ? "✅" : "🚫"}\n` +
            `  → \`/${truncate(t.pattern, 120)}/${t.flags ?? "i"}\`\n` +
            `  ${truncate(t.description ?? "—", 140)}`,
        )
        .join("\n\n"),
      footer:
        sorted.length > shown.length
          ? `${sorted.length - shown.length} trigger(s) supplémentaire(s) non affiché(s)`
          : undefined,
      kind: "info",
    });
    await this.replyEphemeral(interaction, embed);
  }

  @Slash({ name: "remove", description: "Supprimer définitivement un trigger" })
  async remove(
    @SlashOption({
      name: "code",
      description: "Code du trigger à supprimer",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    code: string,
    interaction: CommandInteraction,
  ) {
    const exists = (await this.ach.list()).some((t) => t.code === code);
    if (exists) await this.ach.remove(code);
    await this.replyEphemeral(
      interaction,
      exists ? successEmbed("Trigger supprimé", `\`${code}\` retiré.`) : notFound(code),
    );
  }

  @Slash({ name: "enable", description: "Activer un trigger sans le recréer" })
  async enable(
    @SlashOption({
      name: "code",
      description: "Code du trigger",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    code: string,
    interaction: CommandInteraction,
  ) {
    const ok = await this.ach.setEnabled(code, true);
    await this.replyEphemeral(
      interaction,
      ok ? successEmbed("Trigger activé", `\`${code}\` est désormais actif.`) : notFound(code),
    );
  }

  @Slash({ name: "disable", description: "Désactiver un trigger sans le supprimer" })
  async disable(
    @SlashOption({
      name: "code",
      description: "Code du trigger",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    code: string,
    interaction: CommandInteraction,
  ) {
    const ok = await this.ach.setEnabled(code, false);
    await this.replyEphemeral(
      interaction,
      ok
        ? warningEmbed(
            "Trigger désactivé",
            `\`${code}\` ne se déclenchera plus jusqu'au prochain \`/succes enable\`.`,
          )
        : notFound(code),
    );
  }

  @Slash({ name: "test", description: "Tester un trigger contre un texte d'exemple" })
  async test(
    @SlashOption({
      name: "code",
      description: "Code du trigger",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    code: string,
    @SlashOption({
      name: "texte",
      description: "Texte à tester contre la regex",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 1500,
    })
    sample: string,
    interaction: CommandInteraction,
  ) {
    const result = await this.ach.test(code, sample);
    if (!result) {
      await this.replyEphemeral(interaction, notFound(code));
      return;
    }
    await this.replyEphemeral(
      interaction,
      result.match
        ? successEmbed(
            `Match`,
            `Le pattern \`/${result.pattern}/${result.flags}\` **matche** le texte fourni.`,
          )
        : warningEmbed(
            `Pas de match`,
            `Le pattern \`/${result.pattern}/${result.flags}\` ne matche pas.\n\n> ${truncate(sample, 200)}`,
          ),
    );
  }
}
