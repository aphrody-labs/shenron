import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type Channel,
  type CommandInteraction,
  type EmbedBuilder,
  type Role,
} from "discord.js";
import { eq } from "drizzle-orm";
import { GuildOnly } from "~/guards/GuildOnly";
import {
  SettingsService,
  SETTINGS_KEYS,
  XP_BOOST_ROLE_PREFIX,
  findSettingDef,
  type SettingDef,
} from "~/services/SettingsService";
import { EconomyService } from "~/services/EconomyService";
import { FusionRoleService } from "~/services/FusionRoleService";
import { DatabaseService } from "~/db/index";
import { actionLogs, levelRewards } from "~/db/schema";
import { xpRequiredForLevel } from "~/lib/xp";
import { DEFAULT_XP_BOOST_CONFIG, roleBoostLimit } from "~/lib/xp-boosts";
import { formatZeni } from "@aphrody/shenron-config/zeni";
import { logger } from "~/lib/logger";
import {
  brandedEmbed,
  COLORS,
  errorEmbed,
  errorText,
  shenronEmbed,
  successEmbed,
  truncate,
} from "~/lib/embeds";

export type SettingCategory = NonNullable<SettingDef["category"]> | "other";

/** Display labels of the `/config list` categories, in display order. */
export const SETTING_CATEGORY_LABELS: Record<SettingCategory, string> = {
  xp: "⚡ XP & niveaux",
  economy: "💰 Économie",
  channels: "📺 Salons",
  roles: "🎭 Rôles",
  moderation: "🛡️ Modération",
  anti_invite: "🔗 Anti-invitation",
  tickets: "🎫 Tickets",
  features: "🧩 Fonctionnalités",
  gifs: "🎞️ GIFs",
  advanced: "🔧 Avancé",
  other: "📦 Autres",
};

const categoryOf = (def: SettingDef): SettingCategory => def.category ?? "other";

/** Keys editable by `/config set|unset` (prefix collections have their own subcommands). */
const EDITABLE_KEYS = SETTINGS_KEYS.filter((s) => !s.prefix);
/** Keys targeted by `/config channel`. */
const CHANNEL_KEYS = EDITABLE_KEYS.filter((s) => s.type === "snowflake" && s.channelType);

/**
 * Up to 25 autocomplete entries matching `query` (key or description, case-insensitive),
 * key prefixes first. Replaces the former static choices, capped at the first 25 keys.
 */
export function settingSuggestions(
  query: string,
  defs: readonly SettingDef[] = EDITABLE_KEYS,
): Array<{ name: string; value: string }> {
  const q = query.trim().toLowerCase();
  const rankOf = (def: SettingDef): number => {
    if (!q) return 1;
    const key = def.key.toLowerCase();
    if (key.startsWith(q)) return 0;
    if (key.includes(q)) return 1;
    return def.description.toLowerCase().includes(q) ? 2 : -1;
  };
  return defs
    .map((def) => ({ def, rank: rankOf(def) }))
    .filter((s) => s.rank >= 0)
    .toSorted((a, b) => a.rank - b.rank || a.def.key.localeCompare(b.def.key))
    .slice(0, 25)
    .map(({ def }) => ({ name: truncate(`${def.key} — ${def.description}`, 100), value: def.key }));
}

/** One `/config list` line: key, current value (or default) and override marker. */
export function settingLine(def: SettingDef, value: string | undefined): string {
  if (value !== undefined) {
    let shown = `\`${truncate(value, 60)}\``;
    if (def.type === "snowflake" && def.channelType) shown = `<#${value}>`;
    else if (def.type === "snowflake" && def.category === "roles") shown = `<@&${value}>`;
    return `✏️ \`${def.key}\` → ${shown}`;
  }
  const fallback = def.default === undefined || def.default === "" ? "—" : String(def.default);
  return `▫️ \`${def.key}\` → *${truncate(fallback, 40)}*`;
}

/** Whether a Discord channel fits the type expected by a setting. */
function channelMatches(def: SettingDef, channel: Channel): boolean {
  switch (def.channelType) {
    case "voice":
      return (
        channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice
      );
    case "category":
      return channel.type === ChannelType.GuildCategory;
    case "text":
      return channel.isTextBased() && !channel.isDMBased();
    default:
      return true;
  }
}

const CHANNEL_KIND_LABEL: Record<string, string> = {
  voice: "vocal",
  category: "de type catégorie",
  text: "textuel",
};

@Discord()
@Bot("shenron")
@Guard(GuildOnly)
@SlashGroup({
  name: "config",
  description: "Admin: configuration runtime du bot (XP, salons, niveaux)",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
@SlashGroup("config")
@injectable()
export class ConfigCommand {
  constructor(
    @inject(SettingsService) private settings: SettingsService,
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(EconomyService) private eco: EconomyService,
    @inject(FusionRoleService) private fusionRoles: FusionRoleService,
  ) {}

  private async replyEphemeral(interaction: CommandInteraction, embed: EmbedBuilder) {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async autocompleteKey(
    interaction: AutocompleteInteraction,
    defs?: readonly SettingDef[],
  ) {
    await interaction
      .respond(settingSuggestions(String(interaction.options.getFocused() ?? ""), defs))
      .catch(() => {});
  }

  @Slash({ name: "list", description: "Lister les valeurs runtime (par catégorie)" })
  async list(
    @SlashChoice(
      ...Object.entries(SETTING_CATEGORY_LABELS).map(([value, name]) => ({ name, value })),
    )
    @SlashOption({
      name: "categorie",
      description: "Catégorie à détailler (défaut : résumé et surcharges actives)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    category: SettingCategory | undefined,
    interaction: CommandInteraction,
  ) {
    const rows = await this.settings.list();
    const values = new Map(rows.map((r) => [r.key, r.value]));

    if (category) {
      const defs = EDITABLE_KEYS.filter((d) => categoryOf(d) === category);
      const overridden = defs.filter((d) => values.has(d.key)).length;
      await this.replyEphemeral(
        interaction,
        shenronEmbed({
          header: "CONFIGURATION",
          title: `${SETTING_CATEGORY_LABELS[category]} · ${defs.length} réglage(s)`,
          color: COLORS.info,
          description: [
            `✏️ surchargé (${overridden}) · ▫️ défaut — \`/config set\` pour modifier.`,
            "",
            ...defs.map((d) => settingLine(d, values.get(d.key))),
          ].join("\n"),
        }),
      );
      return;
    }

    const summary = Object.entries(SETTING_CATEGORY_LABELS).flatMap(([key, label]) => {
      const defs = EDITABLE_KEYS.filter((d) => categoryOf(d) === key);
      if (defs.length === 0) return [];
      const overridden = defs.filter((d) => values.has(d.key)).length;
      return [`${label} — **${defs.length}** réglage(s)${overridden ? ` · ✏️ ${overridden}` : ""}`];
    });
    const overrides = rows
      .filter((r) => r.def && !r.def.prefix)
      .toSorted((a, b) => a.key.localeCompare(b.key))
      .map((r) => settingLine(r.def!, r.value));
    await this.replyEphemeral(
      interaction,
      shenronEmbed({
        header: "CONFIGURATION",
        title: "⚙️ Configuration runtime",
        color: COLORS.info,
        description: [
          "Les surcharges en base priment sur l'environnement et les constantes.",
          "Détail d'une catégorie : `/config list categorie:<…>`.",
          "",
          ...summary,
          "",
          `**Surcharges actives (${overrides.length})**`,
          ...(overrides.length ? overrides : ["*(aucune)*"]),
        ].join("\n"),
      }),
    );
  }

  @Slash({ name: "set", description: "Définir une valeur (entier, décimal, booléen, ID…)" })
  async set(
    @SlashOption({
      name: "key",
      description: "Clé à éditer (recherche par nom ou description)",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    key: string,
    @SlashOption({
      name: "value",
      description: "Nouvelle valeur",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    value: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await this.autocompleteKey(interaction);
      return;
    }
    try {
      await this.settings.set(key, value);
      const stored = (await this.settings.getRaw(key)) ?? value;
      await this.replyEphemeral(
        interaction,
        successEmbed("Réglage mis à jour", `\`${key}\` = \`${truncate(stored, 500)}\``),
      );
    } catch (err) {
      await this.replyEphemeral(interaction, errorEmbed("Valeur refusée", errorText(err)));
    }
  }

  @Slash({ name: "unset", description: "Supprimer une surcharge (revient au défaut)" })
  async unset(
    @SlashOption({
      name: "key",
      description: "Clé à supprimer",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    key: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await this.autocompleteKey(interaction);
      return;
    }
    const def = findSettingDef(key);
    if (!def || def.prefix) {
      await this.replyEphemeral(
        interaction,
        errorEmbed("Réglage inconnu", `\`${truncate(key, 100)}\` n'est pas une clé /config.`),
      );
      return;
    }
    const had = (await this.settings.getRaw(key)) !== undefined;
    await this.settings.unset(key);
    await this.replyEphemeral(
      interaction,
      had
        ? successEmbed("Réglage réinitialisé", `\`${key}\` revient au défaut.`)
        : brandedEmbed({
            title: "Aucune surcharge",
            description: `\`${key}\` utilisait déjà sa valeur par défaut.`,
            kind: "muted",
          }),
    );
  }

  @Slash({ name: "channel", description: "Raccourci pour définir un salon" })
  async channel(
    @SlashOption({
      name: "type",
      description: "Type de salon (annonces, niveaux, logs…)",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    type: string,
    @SlashOption({
      name: "salon",
      description: "Salon cible",
      type: ApplicationCommandOptionType.Channel,
      required: true,
    })
    channel: Channel,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await this.autocompleteKey(interaction, CHANNEL_KEYS);
      return;
    }
    const def = CHANNEL_KEYS.find((d) => d.key === type);
    if (!def) {
      await this.replyEphemeral(
        interaction,
        errorEmbed(
          "Type de salon inconnu",
          `\`${truncate(type, 100)}\` n'est pas un salon /config.`,
        ),
      );
      return;
    }
    if (!channelMatches(def, channel)) {
      await this.replyEphemeral(
        interaction,
        errorEmbed(
          "Salon incompatible",
          `\`${def.key}\` attend un salon ${CHANNEL_KIND_LABEL[def.channelType ?? ""] ?? "compatible"}.`,
        ),
      );
      return;
    }
    try {
      await this.settings.set(def.key, channel.id);
      await this.replyEphemeral(
        interaction,
        successEmbed("Salon défini", `<#${channel.id}> pour \`${def.key}\` (${def.description})`),
      );
    } catch (err) {
      await this.replyEphemeral(interaction, errorEmbed("Erreur", errorText(err)));
    }
  }

  @Slash({ name: "level-reward-set", description: "Lier un rôle à un niveau (level reward)" })
  async levelRewardSet(
    @SlashOption({
      name: "level",
      description: "Niveau (entier ≥ 1)",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
      maxValue: 999,
    })
    level: number,
    @SlashOption({
      name: "role",
      description: "Rôle à attribuer",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    @SlashOption({
      name: "xp-threshold",
      description: "XP requise (défaut: seuil du niveau dans la courbe active)",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 0,
    })
    xpThreshold: number | undefined,
    @SlashOption({
      name: "zeni-bonus",
      description: "Bonus zeni (défaut 1000)",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 0,
    })
    zeniBonus: number | undefined,
    interaction: CommandInteraction,
  ) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Sanity check : le bot doit pouvoir attribuer ce rôle (position < bot.highest)
    const botMember =
      interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
    const aboveBot = botMember !== null && role.position >= botMember.roles.highest.position;
    if (role.managed || aboveBot) {
      await interaction.editReply({
        embeds: [
          role.managed
            ? errorEmbed(
                "Rôle d'intégration",
                `${role} est géré par une intégration : le bot ne peut pas l'attribuer.`,
              )
            : errorEmbed(
                "Rôle au-dessus du bot",
                `${role} (position ${role.position}) ≥ rôle bot (${botMember?.roles.highest.position}). ` +
                  "Range le rôle du bot au-dessus dans les paramètres serveur, sinon l'attribution échouera silencieusement.",
              ),
        ],
      });
      return;
    }

    // Default threshold: the active level curve (`xp.thresholds`), the one level-ups use.
    const computed = xpThreshold ?? xpRequiredForLevel(level);
    const bonus = zeniBonus ?? 1000;

    try {
      await this.dbs.db
        .insert(levelRewards)
        .values({ level, roleId: role.id, xpThreshold: computed, zeniBonus: bonus })
        .onConflictDoUpdate({
          target: levelRewards.level,
          set: { roleId: role.id, xpThreshold: computed, zeniBonus: bonus },
        });
    } catch (err) {
      await interaction.editReply({
        embeds: [errorEmbed("Enregistrement échoué", errorText(err))],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Level reward enregistré",
          `Niveau **${level}** → ${role}\nSeuil XP : \`${computed.toLocaleString("fr-FR")}\` · Bonus : **${formatZeni(bonus)}**`,
        ),
      ],
    });
  }

  @Slash({ name: "level-reward-remove", description: "Supprimer une level reward" })
  async levelRewardRemove(
    @SlashOption({
      name: "level",
      description: "Niveau à supprimer",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
    })
    level: number,
    interaction: CommandInteraction,
  ) {
    const removed = await this.dbs.db
      .delete(levelRewards)
      .where(eq(levelRewards.level, level))
      .returning({ level: levelRewards.level });
    await this.replyEphemeral(
      interaction,
      removed.length
        ? successEmbed("Level reward supprimée", `Niveau **${level}**`)
        : errorEmbed("Aucune level reward", `Aucune récompense configurée au niveau **${level}**.`),
    );
  }

  @Slash({ name: "level-rewards", description: "Liste des level rewards configurées" })
  async levelRewardsList(interaction: CommandInteraction) {
    const rows = await this.dbs.db.select().from(levelRewards).orderBy(levelRewards.level);
    if (!rows.length) {
      await this.replyEphemeral(
        interaction,
        brandedEmbed({
          title: "📜 Level rewards",
          description: "*(aucune configurée — `/config level-reward-set` pour en ajouter)*",
          kind: "muted",
        }),
      );
      return;
    }
    await this.replyEphemeral(
      interaction,
      shenronEmbed({
        header: "CONFIGURATION",
        title: `📜 Level rewards (${rows.length})`,
        color: COLORS.info,
        description: rows
          .map(
            (r) =>
              `**Niv. ${r.level}** → <@&${r.roleId}> · seuil \`${r.xpThreshold.toLocaleString("fr-FR")}\` XP · +${formatZeni(r.zeniBonus)}`,
          )
          .join("\n"),
      }),
    );
  }

  // ── XP Boost par rôle ────────────────────────────────────────────────
  @Slash({ name: "xp-boost-set", description: "Définir un multiplier XP pour un rôle" })
  async xpBoostSet(
    @SlashOption({
      name: "role",
      description: "Rôle bénéficiaire du boost",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    @SlashOption({
      name: "multiplier",
      description: "Multiplier décimal > 0 (ex: 1.5, 2)",
      type: ApplicationCommandOptionType.Number,
      required: true,
      minValue: 0.01,
    })
    multiplier: number,
    interaction: CommandInteraction,
  ) {
    const key = `${XP_BOOST_ROLE_PREFIX}${role.id}`;
    const previous = await this.settings.getRaw(key);
    const audit = (extra: Record<string, unknown>) =>
      this.dbs.db
        .insert(actionLogs)
        .values({
          moderatorId: interaction.user.id,
          action: "CONFIG_SET",
          meta: JSON.stringify({
            key,
            value: String(multiplier),
            previous: previous ?? null,
            ...extra,
          }),
        })
        .catch((err) => logger.error({ err, key }, "CONFIG_SET ledger write failed"));
    try {
      // A boost above the cumulative cap has no legitimate use: it is refused (and the attempt
      // logged) instead of being accepted then silently clipped.
      const limit = roleBoostLimit(
        await this.settings.getFloat("xp.multiplier.max", DEFAULT_XP_BOOST_CONFIG.maxMultiplier),
      );
      if (multiplier > limit) {
        await audit({ refused: true, limit });
        throw new Error(`${key} ≤ ${limit}.`);
      }
      await this.settings.set(key, String(multiplier));
      await audit({});
      await this.replyEphemeral(
        interaction,
        successEmbed("Boost XP enregistré", `${role} → multiplier **×${multiplier}**`),
      );
    } catch (err) {
      await this.replyEphemeral(interaction, errorEmbed("Erreur", errorText(err)));
    }
  }

  @Slash({ name: "xp-boost-unset", description: "Supprimer un boost XP par rôle" })
  async xpBoostUnset(
    @SlashOption({
      name: "role",
      description: "Rôle dont on retire le boost",
      type: ApplicationCommandOptionType.Role,
      required: true,
    })
    role: Role,
    interaction: CommandInteraction,
  ) {
    const key = `${XP_BOOST_ROLE_PREFIX}${role.id}`;
    const had = (await this.settings.getRaw(key)) !== undefined;
    await this.settings.unset(key);
    await this.replyEphemeral(
      interaction,
      had
        ? successEmbed("Boost XP supprimé", `${role}`)
        : errorEmbed("Aucun boost", `${role} n'a pas de boost XP configuré.`),
    );
  }

  @Slash({ name: "xp-boost-list", description: "Liste des boosts XP par rôle" })
  async xpBoostList(interaction: CommandInteraction) {
    const boosts = await this.settings.getXpBoostRoles();
    if (boosts.length === 0) {
      await this.replyEphemeral(
        interaction,
        brandedEmbed({
          title: "🚀 Boosts XP par rôle",
          description: "*(aucun configuré — `/config xp-boost-set` pour en ajouter)*",
          kind: "muted",
        }),
      );
      return;
    }
    // Mentions do not render in field names: one line per role in the description.
    await this.replyEphemeral(
      interaction,
      shenronEmbed({
        header: "CONFIGURATION",
        title: `🚀 Boosts XP par rôle (${boosts.length})`,
        color: COLORS.info,
        description: [
          "Le membre reçoit le **plus grand** multiplier parmi ses rôles (ne stack pas).",
          "",
          ...boosts
            .toSorted((a, b) => b.multiplier - a.multiplier)
            .map((b) => `<@&${b.roleId}> → **×${b.multiplier}**`),
        ].join("\n"),
      }),
    );
  }

  // ── Sync rôle Fusion ─────────────────────────────────────────────────
  @Slash({
    name: "fusion-sync-roles",
    description: "Re-attribuer le rôle 'Fusion' à toutes les fusions actives",
  })
  async fusionSyncRoles(interaction: CommandInteraction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const fusions = await this.eco.listAllFusions();
    if (fusions.length === 0) {
      await interaction.editReply({
        embeds: [
          brandedEmbed({
            title: "💫 Sync fusion",
            description: "*(aucune fusion active)*",
            kind: "muted",
          }),
        ],
      });
      return;
    }
    let failed = 0;
    for (const f of fusions) {
      try {
        await this.fusionRoles.applyToPair(interaction.guild, f.userA, f.userB);
      } catch (err) {
        failed++;
        logger.warn({ err, userA: f.userA, userB: f.userB }, "[config] fusion role sync failed");
      }
    }
    await interaction.editReply({
      embeds: [
        successEmbed(
          "Sync fusion terminée",
          `${fusions.length - failed}/${fusions.length} fusion(s) traitée(s).${failed ? `\n⚠️ ${failed} échec(s), voir les logs.` : ""}`,
        ),
      ],
    });
  }
}
