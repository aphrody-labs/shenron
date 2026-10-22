import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionFlagsBits,
  type CommandInteraction,
  type Role,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { LevelService } from "~/services/LevelService";
import { levelForXP, xpRequiredForLevel } from "~/lib/xp";
import { errorEmbed, successEmbed, warningEmbed } from "~/lib/embeds";
import { logger } from "~/lib/logger";

/** New XP of a member after `/niveau`: XP delta, or a whole-level jump to that level's threshold. */
export function adjustedXp(
  currentXP: number,
  kind: "niveau" | "exp",
  sign: 1 | -1,
  amount: number,
): number {
  if (kind === "exp") return Math.max(0, currentXP + sign * amount);
  const newLevel = Math.max(0, levelForXP(currentXP) + sign * amount);
  return newLevel === 0 ? 0 : xpRequiredForLevel(newLevel);
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly)
@injectable()
export class LevelAdminCommands {
  constructor(@inject(LevelService) private levels: LevelService) {}

  // /niveau : admin uniquement — modifie XP/niveau d'un membre, d'un rôle, ou de tous les inscrits
  @Slash({
    name: "niveau",
    description: "Admin: modifier niveau/xp",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  async niveauAdmin(
    @SlashChoice({ name: "give", value: "give" })
    @SlashChoice({ name: "remove", value: "remove" })
    @SlashOption({
      name: "action",
      description: "give/remove",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    action: "give" | "remove",
    @SlashChoice({ name: "niveau", value: "niveau" })
    @SlashChoice({ name: "exp", value: "exp" })
    @SlashOption({
      name: "type",
      description: "niveau ou exp",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    kind: "niveau" | "exp",
    @SlashOption({
      name: "montant",
      description: "Montant",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
    })
    amount: number,
    @SlashOption(
      {
        name: "membre",
        description: "Membre",
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
    @SlashOption({
      name: "all",
      description: "Tous les inscrits",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    all: boolean | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    const targets = [user, role, all ? true : undefined].filter((t) => t !== undefined).length;
    if (targets !== 1) {
      await interaction.reply({
        embeds: [
          warningEmbed(
            "Cible ambiguë",
            "Spécifie **une seule** cible : `membre`, `role` ou `all:true`.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sign = action === "give" ? 1 : -1;
    let failed = 0;
    // One member's failure (left the guild, role above the bot…) must not stop a batch.
    const apply = async (id: string) => {
      try {
        const c = await this.levels.getUser(id);
        const res = await this.levels.setXP(id, adjustedXp(c?.xp ?? 0, kind, sign, amount));
        if (res.levelUp) {
          const member = await interaction.guild.members.fetch(id).catch(() => null);
          if (member) await this.levels.handleLevelUp(member, res.newLevel);
        }
      } catch (err) {
        failed++;
        logger.warn({ err, userId: id }, "[niveau] adjustment failed");
      }
    };

    let ids: string[];
    let label: string;
    if (user) {
      ids = [user.id];
      label = `${user}`;
    } else if (role) {
      const members = await interaction.guild.members.fetch();
      ids = [...members.values()].filter((m) => m.roles.cache.has(role.id)).map((m) => m.id);
      label = `${ids.length} membre(s) avec ${role}`;
    } else {
      ids = (await this.levels.top(10_000, 0)).map((u) => u.id);
      label = `${ids.length} membre(s) inscrit(s)`;
    }
    for (const id of ids) await apply(id);

    const what = `${action === "give" ? "+" : "−"}${amount} ${kind === "niveau" ? "niveau(x)" : "XP"}`;
    await interaction.editReply({
      embeds: [
        failed === ids.length && ids.length > 0
          ? errorEmbed("Ajustement échoué", `${what} n'a pu être appliqué à ${label}.`)
          : successEmbed(
              "Ajustement appliqué",
              `${what} appliqué à ${label}.${failed ? `\n⚠️ ${failed} échec(s), voir les logs.` : ""}`,
            ),
      ],
    });
  }
}
