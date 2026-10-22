import { resolveSiteUrl } from "@aphrody/shenron-config/public-urls";
import {
  Bot,
  Discord,
  Guard,
  MetadataStorage,
  SelectMenuComponent,
  Slash,
  type DApplicationCommand,
} from "discordx";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type BaseInteraction,
  type CommandInteraction,
  type EmbedBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import { env } from "~/lib/env";
import { GuildOnly } from "~/guards/GuildOnly";
import { SHENRON_THEME, SHENRON_SEPARATORS, shenronEmbed, truncate } from "~/lib/embeds";

const SITE_URL = resolveSiteUrl(Bun.env);

export interface CategoryDef {
  key: string;
  title: string;
  icon: string;
  description: string;
  color: number;
  /** Top-level command or group names (`/shop`, `/config …`) of the category. */
  cmds: Set<string>;
  modOnly?: boolean;
}

/** Key of the catch-all category holding the public commands no category lists. */
export const OTHER_CATEGORY = "autres";

export const CATEGORIES: CategoryDef[] = [
  {
    key: "profil",
    title: "Profil & Puissance",
    icon: "⚡",
    description: "Progression martiale, cartes de combattant et classements de puissance",
    color: SHENRON_THEME.saiyanBlue,
    cmds: new Set(["profil", "top", "stats", "scan", "eprofil", "boosts", "race", "inventaire"]),
  },
  {
    key: "eco",
    title: "Économie & Boutique",
    icon: "💰",
    description: "Gestion des Zénis, boutique cosmétique, inventaire et unions par fusion",
    color: SHENRON_THEME.gold,
    cmds: new Set(["solde", "shop", "buy", "fusion", "defusion"]),
  },
  {
    key: "wiki",
    title: "Wiki & Savoir Canonique",
    icon: "📜",
    description: "Arbitre de canonicité, fiches de personnages, planètes et databooks",
    color: SHENRON_THEME.kiGreen,
    cmds: new Set(["canon", "wiki", "races", "planete", "databooks", "ask", "scanlate"]),
  },
  {
    key: "fun",
    title: "Mini-Jeux & Tournois",
    icon: "🎮",
    description: "Défis ludiques, duels martiaux, pendu et mini-jeux de détente",
    color: SHENRON_THEME.beerusPurple,
    cmds: new Set(["gay", "raciste", "pendu", "morpion", "bingo", "pfc"]),
  },
  {
    key: "tickets",
    title: "Assistance & Salons Vocaux",
    icon: "🎫",
    description: "Tickets de support, salons vocaux dynamiques et signalements",
    color: SHENRON_THEME.orange,
    cmds: new Set(["close", "ticket", "voc", "report"]),
  },
  {
    key: "giveaway",
    title: "Événements & Communauté",
    icon: "🎁",
    description: "Tirages au sort, cadeaux et invitations de la communauté",
    color: SHENRON_THEME.gold,
    cmds: new Set(["giveaway", "invitations", "inviteur"]),
  },
  {
    key: "mod",
    title: "Discipline & Modération",
    icon: "🛡️",
    description: "Outils de maintien de l'ordre et sanctions divines",
    color: SHENRON_THEME.majinRed,
    cmds: new Set([
      "warn",
      "unwarn",
      "warns",
      "clearwarns",
      "mute",
      "unmute",
      "jail",
      "unjail",
      "jail-setup",
      "ban",
      "unban",
      "kick",
      "clear",
      "purge",
      "role",
      "sstats",
      "slowmode",
      "lock",
      "unlock",
      "nick",
      "note",
    ]),
    modOnly: true,
  },
  {
    key: "admin",
    title: "Administration & Système",
    icon: "⚙️",
    description: "Paramétrage du sanctuaire, configuration des gains et succès",
    color: 0x475569,
    cmds: new Set([
      "niveau",
      "zeni",
      "custom",
      "ticket-panel",
      "shop-panel",
      "shop-item",
      "ids",
      "config",
      "succes",
      "admin",
      "goal",
      "train",
      "tiktok",
      "notif-tiktok",
    ]),
    modOnly: true,
  },
  {
    key: OTHER_CATEGORY,
    title: "Autres commandes",
    icon: "📦",
    description: "Commandes disponibles qui ne relèvent d'aucune autre catégorie",
    color: SHENRON_THEME.silverUltra,
    cmds: new Set(),
  },
];

/** Top-level name of a slash command: its group for a subcommand, else its own name. */
export function rootName(c: Pick<DApplicationCommand, "group" | "name">): string {
  return c.group ?? c.name;
}

function getLabelOf(c: DApplicationCommand): string {
  if (c.group && c.subgroup) return `/${c.group} ${c.subgroup} ${c.name}`;
  if (c.group) return `/${c.group} ${c.name}`;
  return `/${c.name}`;
}

function getGuildCommands(guildId: string): DApplicationCommand[] {
  const all = MetadataStorage.instance.applicationCommandSlashesFlat;
  return all.filter((c) => {
    const guilds = c.guilds ?? [];
    if (guilds.length === 0) return true;
    return guilds.some((g) => (Array.isArray(g) ? g.includes(guildId) : g === guildId));
  });
}

/** Top-level names restricted by Discord permissions (`defaultMemberPermissions`). */
function staffOnlyRoots(): Set<string> {
  const out = new Set<string>();
  for (const c of MetadataStorage.instance.applicationCommandSlashesFlat) {
    if (!c.group && c.defaultMemberPermissions != null) out.add(c.name);
  }
  for (const g of MetadataStorage.instance.applicationCommandSlashGroups) {
    const perms = (g.payload as { defaultMemberPermissions?: unknown }).defaultMemberPermissions;
    if (!g.root && perms != null) out.add(g.name);
  }
  return out;
}

/**
 * Commands shown in `cat`. A staff-only command (Discord default permissions) never shows
 * to a member without the moderation view; listed commands follow their category; the
 * catch-all gets every remaining public command, so no new command goes undocumented.
 */
export function commandsOfCategory<T extends Pick<DApplicationCommand, "group" | "name">>(
  cat: CategoryDef,
  commands: readonly T[],
  staffOnly: ReadonlySet<string>,
  canSeeMod: boolean,
): T[] {
  const listed = new Set(CATEGORIES.flatMap((c) => [...c.cmds]));
  return commands.filter((c) => {
    const root = rootName(c);
    if (staffOnly.has(root) && !canSeeMod) return false;
    if (cat.key === OTHER_CATEGORY) return !listed.has(root) && !staffOnly.has(root);
    if (cat.key === "admin" && !listed.has(root) && staffOnly.has(root)) return true;
    return cat.cmds.has(root);
  });
}

function canSeeModeration(interaction: BaseInteraction): boolean {
  const perms = interaction.memberPermissions ?? new PermissionsBitField();
  return (
    perms.has(PermissionsBitField.Flags.ModerateMembers) ||
    perms.has(PermissionsBitField.Flags.Administrator)
  );
}

function visibleCategories(canSeeMod: boolean): CategoryDef[] {
  return CATEGORIES.filter((cat) => !cat.modOnly || canSeeMod);
}

function buildHomeEmbed(canSeeMod: boolean, totalCmds: number): EmbedBuilder {
  return shenronEmbed({
    header: "CENTRE D'AIDE ET DE DOCTRINE",
    title: "🐉 Le Sanctuaire des Commandes Shenron · 神龍",
    color: SHENRON_THEME.orange,
    footer: "Shenron · L'autorité suprême de Dragon Ball",
    timestamp: false,
    description: [
      "Bienvenue, guerrier ! Shenron met à ta disposition l'ensemble des pouvoirs et connaissances de l'univers Dragon Ball.",
      "",
      SHENRON_SEPARATORS.solid,
      "**Sélectionne une catégorie ci-dessous** pour explorer les incantations disponibles :",
      "",
      ...visibleCategories(canSeeMod).map(
        (cat) => `> ${cat.icon} **${cat.title}**\n> └ *${cat.description}*`,
      ),
      "",
      SHENRON_SEPARATORS.solid,
      `⚡ **${totalCmds} commandes actives** déployées sur ce sanctuaire.`,
      `📖 Base de données officielle & doctrine : [dragonballfr.com](${SITE_URL})`,
    ].join("\n"),
  });
}

function buildCategoryEmbed(cat: CategoryDef, commands: DApplicationCommand[]): EmbedBuilder {
  const lines = commands
    .map((c) => `• **\`${getLabelOf(c)}\`** — ${c.description || "Aucune description."}`)
    .toSorted();
  // Whole lines only: a cut in the middle of a line would break its markdown.
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > 3600) break;
    kept.push(line);
    size += line.length + 1;
  }
  const hidden = lines.length - kept.length;

  return shenronEmbed({
    header: "CENTRE D'AIDE",
    title: `${cat.icon} ${cat.title}`,
    color: cat.color,
    timestamp: false,
    footer: `${commands.length} commande(s) dans ce grimoire · Sélectionne une autre catégorie ci-dessous`,
    description: [
      `*${cat.description}*`,
      "",
      SHENRON_SEPARATORS.solid,
      "",
      ...(kept.length > 0 ? kept : ["*Aucune commande répertoriée.*"]),
      ...(hidden > 0 ? [`*… et ${hidden} autre(s) : tape \`/\` pour les voir.*`] : []),
      "",
      SHENRON_SEPARATORS.solid,
    ].join("\n"),
  });
}

function buildNavComponents(canSeeMod: boolean, currentKey = "home") {
  const select = new StringSelectMenuBuilder()
    .setCustomId("help:category")
    .setPlaceholder("🔮 Choisir un domaine de techniques…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Accueil Shenron")
        .setValue("home")
        .setDescription("Vue d'ensemble et guide du sanctuaire")
        .setEmoji("🐉")
        .setDefault(currentKey === "home"),
      ...visibleCategories(canSeeMod).map((cat) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.title)
          .setValue(cat.key)
          .setDescription(truncate(cat.description, 100))
          .setEmoji(cat.icon)
          .setDefault(currentKey === cat.key),
      ),
    );

  const rowSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Site Officiel")
      .setEmoji("🌐")
      .setURL(SITE_URL),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Wiki Canon")
      .setEmoji("📜")
      .setURL(`${SITE_URL}/wiki/canon`),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Databooks")
      .setEmoji("📚")
      .setURL(`${SITE_URL}/wiki/databooks`),
  );

  return [rowSelect, rowButtons];
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly)
export class HelpCommand {
  @Slash({ name: "help", description: "Consulter le centre d'aide interactif de Shenron" })
  async help(interaction: CommandInteraction) {
    const onGuild = getGuildCommands(env.GUILD_ID);
    const canSeeMod = canSeeModeration(interaction);
    await interaction.reply({
      embeds: [buildHomeEmbed(canSeeMod, onGuild.length)],
      components: buildNavComponents(canSeeMod, "home"),
      flags: MessageFlags.Ephemeral,
    });
  }

  @SelectMenuComponent({ id: "help:category" })
  async onSelectCategory(interaction: StringSelectMenuInteraction) {
    const selectedKey = interaction.values[0];
    const onGuild = getGuildCommands(env.GUILD_ID);
    const canSeeMod = canSeeModeration(interaction);

    // A hidden category (moderation, admin) stays hidden even from a crafted selection.
    const cat = visibleCategories(canSeeMod).find((c) => c.key === selectedKey);
    if (selectedKey === "home" || !cat) {
      await interaction.update({
        embeds: [buildHomeEmbed(canSeeMod, onGuild.length)],
        components: buildNavComponents(canSeeMod, "home"),
      });
      return;
    }

    const matched = commandsOfCategory(cat, onGuild, staffOnlyRoots(), canSeeMod);
    await interaction.update({
      embeds: [buildCategoryEmbed(cat, matched)],
      components: buildNavComponents(canSeeMod, cat.key),
    });
  }
}
