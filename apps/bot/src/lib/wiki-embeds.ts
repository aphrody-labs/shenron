/**
 * Presentation helpers shared by the wiki commands (`/wiki`, `/canon`,
 * `/databooks`, `/ask`, forum episode menus).
 *
 * Each command used to redefine its own site and asset origins, truncation
 * helper, branded author/footer, link row and pagination labels — five copies
 * that had drifted (English pagination labels on `/canon`, hard-coded origins
 * on `/ask` and the forum menus, autocomplete names past Discord's 100-char
 * limit). One implementation, aligned on `lib/embeds.ts`.
 */
import { resolveApiUrl, resolveSiteUrl } from "@aphrody/shenron-config/public-urls";
import { Pagination } from "@discordx/pagination";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
  type ApplicationCommandOptionChoiceData,
  type AttachmentBuilder,
  type AutocompleteInteraction,
  type CommandInteraction,
  type EmbedAuthorOptions,
  type EmbedFooterOptions,
} from "discord.js";
import { logger } from "~/lib/logger";

export const SITE_URL = resolveSiteUrl(Bun.env);
export const API_URL = resolveApiUrl(Bun.env);
const BRAND_ICON = `${SITE_URL}/favicon.ico`;
const BRAND = SITE_URL.replace(/^https?:\/\//, "");

/** Discord limits of a choice and of the choice list. */
const CHOICE_MAX = 25;
const CHOICE_TEXT_MAX = 100;
/** Autocomplete must answer within 3 s of the keystroke; keep a margin. */
export const AUTOCOMPLETE_BUDGET_MS = 2_200;

/** One line, collapsed whitespace, `…` when cut. */
export function clip(text: string | null | undefined, max: number): string {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Multi-line text cut at `max`, on a line break when one is close, `…` when cut. */
export function cut(text: string | null | undefined, max: number): string {
  const value = (text ?? "").trim();
  if (value.length <= max) return value;
  const head = value.slice(0, Math.max(1, max - 1));
  const nl = head.lastIndexOf("\n");
  return `${(nl > max * 0.6 ? head.slice(0, nl) : head).trimEnd()}…`;
}

/** Joins whole items while they fit in `max`, then `… +N`. Never cuts a Markdown link. */
export function fitList(items: readonly string[], separator: string, max: number): string {
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const next = out ? `${out}${separator}${items[i]}` : items[i]!;
    const rest = items.length - i - 1;
    const tail = rest > 0 ? `${separator}… +${rest}` : "";
    if (next.length + tail.length > max) {
      const more = `… +${items.length - i}`;
      return out ? `${out}${separator}${more}` : clip(items[i], max);
    }
    out = next;
  }
  return out;
}

/** Text safe inside a Markdown link label `[label](url)`. */
export function linkLabel(text: string, max = 80): string {
  return clip(text, max).replace(/[[\]]/g, "");
}

/** Site-relative path (`/wiki/…`) → absolute URL; absolute URLs pass through. */
export function siteLink(href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  return `${SITE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** Wiki asset path (`./assets/…`) → absolute URL served by the bot API. */
export function wikiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  if (path.includes("..")) return null;
  return `${API_URL}/db/${path.replace(/^\.?\/*/, "")}`;
}

/** Branded author line: `SECTION · dragonballfr.com`. */
export function wikiAuthor(
  section: string,
  iconURL: string | null = BRAND_ICON,
): EmbedAuthorOptions {
  return { name: clip(`${section} · ${BRAND}`, 256), iconURL: iconURL ?? undefined };
}

/** Branded footer: `text · dragonballfr.com`. */
export function wikiFooter(text?: string): EmbedFooterOptions {
  return { text: clip(text ? `${text} · ${BRAND}` : BRAND, 2048), iconURL: BRAND_ICON };
}

export interface LinkButton {
  label: string;
  url: string;
  emoji?: string;
}

/** Row of link buttons (5 max, labels within Discord's 80 chars). */
export function linkRow(links: readonly LinkButton[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...links.slice(0, 5).map((link) => {
      const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(clip(link.label, 80))
        .setURL(siteLink(link.url));
      if (link.emoji) button.setEmoji(link.emoji);
      return button;
    }),
  );
}

/** Choices within Discord's limits: 25 max, name and value ≤ 100 chars, unique values. */
export function safeChoices(
  items: Iterable<{ name: string; value: string }>,
): ApplicationCommandOptionChoiceData<string>[] {
  const seen = new Set<string>();
  const out: ApplicationCommandOptionChoiceData<string>[] = [];
  for (const item of items) {
    // A value cannot be shortened without changing what it designates: skip it.
    if (!item.value || item.value.length > CHOICE_TEXT_MAX || seen.has(item.value)) continue;
    const name = clip(item.name, CHOICE_TEXT_MAX) || item.value;
    seen.add(item.value);
    out.push({ name, value: item.value });
    if (out.length >= CHOICE_MAX) break;
  }
  return out;
}

/**
 * Answers an autocomplete within the 3-second window, whatever the source
 * does: a slow or failing lookup answers an empty list instead of letting the
 * interaction die with an "Unknown interaction" error in the logs.
 */
export async function respondAutocomplete(
  interaction: AutocompleteInteraction,
  load: () => Promise<Iterable<{ name: string; value: string }>>,
  budgetMs = AUTOCOMPLETE_BUDGET_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  let items: Iterable<{ name: string; value: string }> = [];
  try {
    items = (await Promise.race([load(), timeout])) ?? [];
  } catch (err) {
    logger.debug({ err, command: interaction.commandName }, "wiki: autocomplete source failed");
  } finally {
    clearTimeout(timer);
  }
  await interaction.respond(safeChoices(items)).catch(() => {});
}

export interface WikiPage {
  embeds: APIEmbed[];
  files?: AttachmentBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * Sends deferred pages: a single page as a plain reply, several pages with the
 * shared French navigation.
 */
export async function sendPages(
  interaction: CommandInteraction,
  pages: WikiPage[],
  timeMs = 180_000,
): Promise<void> {
  if (pages.length === 0) return;
  if (pages.length === 1) {
    await interaction.editReply(pages[0]!);
    return;
  }
  await new Pagination(interaction, pages, {
    time: timeMs,
    buttons: {
      previous: { label: "Précédent" },
      next: { label: "Suivant" },
      exit: { label: "Fermer" },
    },
  }).send();
}
