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
  PermissionsBitField,
  type BaseInteraction,
  type CommandInteraction,
  type LocaleString,
  type StringSelectMenuInteraction,
} from "discord.js";
import { env } from "~/lib/env";
import { GuildOnly } from "~/guards/GuildOnly";
import {
  discordLocalizations,
  interactionLang,
  t,
  tn,
  type BotLang,
  type BotMessageKey,
} from "~/lib/i18n";
import {
  actions,
  card,
  clip,
  customId,
  edit,
  link,
  reply,
  select,
  LIMITS,
  type Accent,
  type UiMessage,
} from "~/ui";

const SITE_URL = resolveSiteUrl(Bun.env);

/** Pilot of the Components V2 kit (`~/ui`): `/help` is a card, a category select and link buttons. */
export const HELP_MENU_NS = "help";
export const HELP_MENU_VERSION = 1;
const HELP_MENU_ID = customId(HELP_MENU_NS, HELP_MENU_VERSION, "category");
/** Menus of messages sent before the id was versioned (`help:category`) still work. */
export const HELP_MENU_PATTERN = /^help:(?:v1:)?category$/;

type CategoryI18n =
  | "profile"
  | "economy"
  | "lore"
  | "games"
  | "support"
  | "community"
  | "moderation"
  | "admin"
  | "other";

export interface CategoryDef {
  /** Select value, kept stable (`tests/admin-core.test.ts`). */
  key: string;
  /** Dictionary group: `help.category.<i18n>.{title,description}`. */
  i18n: CategoryI18n;
  icon: string;
  accent: Accent;
  /** Top-level command or group names (`/shop`, `/config …`) of the category. */
  cmds: Set<string>;
  modOnly?: boolean;
}

/** Key of the catch-all category holding the public commands no category lists. */
export const OTHER_CATEGORY = "autres";

export const CATEGORIES: CategoryDef[] = [
  {
    key: "profil",
    i18n: "profile",
    icon: "⚡",
    accent: "level",
    cmds: new Set(["profil", "top", "stats", "scan", "eprofil", "boosts", "race", "inventaire"]),
  },
  {
    key: "eco",
    i18n: "economy",
    icon: "💰",
    accent: "economy",
    cmds: new Set(["solde", "shop", "buy", "fusion", "defusion"]),
  },
  {
    key: "wiki",
    i18n: "lore",
    icon: "📜",
    accent: "lore",
    cmds: new Set(["canon", "wiki", "races", "planete", "databooks", "ask", "scanlate"]),
  },
  {
    key: "fun",
    i18n: "games",
    icon: "🎮",
    accent: "games",
    cmds: new Set(["gay", "raciste", "pendu", "morpion", "bingo", "pfc"]),
  },
  {
    key: "tickets",
    i18n: "support",
    icon: "🎫",
    accent: "brand",
    cmds: new Set(["close", "ticket", "voc", "report"]),
  },
  {
    key: "giveaway",
    i18n: "community",
    icon: "🎁",
    accent: "economy",
    cmds: new Set(["giveaway", "invitations", "inviteur"]),
  },
  {
    key: "mod",
    i18n: "moderation",
    icon: "🛡️",
    accent: "staff",
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
    i18n: "admin",
    icon: "⚙️",
    accent: "staff",
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
    i18n: "other",
    icon: "📦",
    accent: "brand",
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

const categoryTitle = (lang: BotLang, cat: CategoryDef) =>
  t(lang, `help.category.${cat.i18n}.title` as BotMessageKey);
const categoryDescription = (lang: BotLang, cat: CategoryDef) =>
  t(lang, `help.category.${cat.i18n}.description` as BotMessageKey);

function navigation(lang: BotLang, canSeeMod: boolean, currentKey: string) {
  return [
    actions(
      select({
        id: HELP_MENU_ID,
        placeholder: `🔮 ${t(lang, "help.placeholder")}`,
        options: [
          {
            label: t(lang, "help.home.label"),
            value: "home",
            description: t(lang, "help.home.description"),
            emoji: "🐉",
            default: currentKey === "home",
          },
          ...visibleCategories(canSeeMod).map((cat) => ({
            label: categoryTitle(lang, cat),
            value: cat.key,
            description: categoryDescription(lang, cat),
            emoji: cat.icon,
            default: currentKey === cat.key,
          })),
        ],
      }),
    ),
    actions(
      link({ url: SITE_URL, label: t(lang, "help.links.site"), emoji: "🌐" }),
      link({ url: `${SITE_URL}/wiki/canon`, label: t(lang, "help.links.wiki"), emoji: "📜" }),
      link({
        url: `${SITE_URL}/wiki/databooks`,
        label: t(lang, "help.links.databooks"),
        emoji: "📚",
      }),
    ),
  ];
}

/** The overview: every category visible to the member, with its description. */
export function buildHomeView(lang: BotLang, canSeeMod: boolean, totalCmds: number): UiMessage {
  return {
    components: [
      card({
        accent: "brand",
        title: `🐉 ${t(lang, "help.title")}`,
        lines: [
          t(lang, "help.intro"),
          "",
          ...visibleCategories(canSeeMod).map(
            (cat) =>
              `> ${cat.icon} **${categoryTitle(lang, cat)}**\n> └ *${categoryDescription(lang, cat)}*`,
          ),
        ],
        footer: tn(lang, "help.active", totalCmds),
        actions: navigation(lang, canSeeMod, "home"),
      }),
    ],
  };
}

/** Text budget of the command list, leaving room for the title, description and footer. */
const LIST_BUDGET = LIMITS.textTotal - 700;

/** One category: its commands, whole lines only (a cut would break the markdown). */
export function buildCategoryView(
  lang: BotLang,
  cat: CategoryDef,
  commands: readonly DApplicationCommand[],
  canSeeMod: boolean,
  locale?: LocaleString,
): UiMessage {
  const lines = commands
    .map((c) => {
      const description =
        (locale ? c.descriptionLocalizations?.[locale] : undefined) ||
        c.description ||
        t(lang, "help.noDescription");
      return `• **\`${getLabelOf(c)}\`** — ${clip(description, 140)}`;
    })
    .toSorted();
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > LIST_BUDGET) break;
    kept.push(line);
    size += line.length + 1;
  }
  const hidden = lines.length - kept.length;
  return {
    components: [
      card({
        accent: cat.accent,
        title: `${cat.icon} ${categoryTitle(lang, cat)}`,
        lines: [
          `*${categoryDescription(lang, cat)}*`,
          "",
          ...(kept.length > 0 ? kept : [`*${t(lang, "help.empty")}*`]),
          ...(hidden > 0 ? [tn(lang, "help.more", hidden)] : []),
        ],
        footer: tn(lang, "help.active", commands.length),
        actions: navigation(lang, canSeeMod, cat.key),
      }),
    ],
  };
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly)
export class HelpCommand {
  @Slash({
    name: "help",
    description: t("en", "commands.help.description"),
    descriptionLocalizations: discordLocalizations("commands.help.description"),
  })
  async help(interaction: CommandInteraction) {
    const onGuild = getGuildCommands(env.GUILD_ID);
    await reply(
      interaction,
      buildHomeView(interactionLang(interaction), canSeeModeration(interaction), onGuild.length),
    );
  }

  @SelectMenuComponent({ id: HELP_MENU_PATTERN })
  async onSelectCategory(interaction: StringSelectMenuInteraction) {
    const lang = interactionLang(interaction);
    const selectedKey = interaction.values[0];
    const onGuild = getGuildCommands(env.GUILD_ID);
    const canSeeMod = canSeeModeration(interaction);

    // A hidden category (moderation, admin) stays hidden even from a crafted selection.
    const cat = visibleCategories(canSeeMod).find((c) => c.key === selectedKey);
    if (selectedKey === "home" || !cat) {
      await edit(interaction, buildHomeView(lang, canSeeMod, onGuild.length));
      return;
    }

    const matched = commandsOfCategory(cat, onGuild, staffOnlyRoots(), canSeeMod);
    await edit(interaction, buildCategoryView(lang, cat, matched, canSeeMod, interaction.locale));
  }
}
