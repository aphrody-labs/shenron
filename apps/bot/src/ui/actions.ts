// SPDX-License-Identifier: Apache-2.0
/**
 * Interactive components: buttons, link buttons and select menus, and the Action Row that holds
 * them. A button is described by a plain spec (`button()`, `link()`, `select()`) so that the same
 * description can sit in a row (`actions()`), in a Section accessory (`section()`), or be passed
 * around by `shareButton()` / `confirm()` / `paginate()`.
 *
 * Ids come from `customId()` (versioned, at most 100 characters). Visible labels are clipped to
 * the Discord limits; values and ids are never clipped (a clipped value would silently select
 * the wrong thing), they throw instead.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { normalizeComponentEmoji } from "~/lib/component-emoji";
import { UiBuildError } from "./errors";
import { LIMITS, clip } from "./limits";

export type ButtonStyleName = "primary" | "secondary" | "success" | "danger";

export interface ButtonSpec {
  type: "button";
  /** Full `custom_id`, from `customId()`. */
  id: string;
  /** Resolved (already translated) label; at least one of `label` and `emoji` is required. */
  label?: string;
  emoji?: string;
  style?: ButtonStyleName;
  disabled?: boolean;
}

export interface LinkSpec {
  type: "link";
  url: string;
  label?: string;
  emoji?: string;
  disabled?: boolean;
}

export interface SelectOptionSpec {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
}

export interface SelectSpec {
  type: "select";
  id: string;
  placeholder?: string;
  options: readonly SelectOptionSpec[];
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
}

export type ActionSpec = ButtonSpec | LinkSpec | SelectSpec;
/** Falsy entries are skipped, so a row can say `cond && button(...)`. */
export type ActionItem = ActionSpec | null | undefined | false;
export type UiRow = ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>;

const STYLES: Record<ButtonStyleName, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

export const button = (spec: Omit<ButtonSpec, "type">): ButtonSpec => ({ type: "button", ...spec });
export const link = (spec: Omit<LinkSpec, "type">): LinkSpec => ({ type: "link", ...spec });
export const select = (spec: Omit<SelectSpec, "type">): SelectSpec => ({ type: "select", ...spec });

function assertId(id: string, what: string): void {
  if (id.length < 1 || id.length > LIMITS.customId) {
    throw new UiBuildError(`${what} custom id must be 1-${LIMITS.customId} characters`);
  }
}

function applyEmoji(target: { setEmoji(emoji: never): unknown }, emoji: string | undefined): void {
  const normalized = emoji === undefined ? null : normalizeComponentEmoji(emoji);
  if (normalized) target.setEmoji(normalized as never);
}

/** A discord.js button from its spec. */
export function buildButton(spec: ButtonSpec | LinkSpec): ButtonBuilder {
  if (spec.label === undefined && spec.emoji === undefined) {
    throw new UiBuildError("a button needs a label or an emoji");
  }
  const builder = new ButtonBuilder();
  if (spec.type === "link") {
    if (spec.url.length > LIMITS.url || !/^https?:\/\//i.test(spec.url)) {
      throw new UiBuildError(
        `link button url must be http(s) and at most ${LIMITS.url} characters`,
      );
    }
    builder.setStyle(ButtonStyle.Link).setURL(spec.url);
  } else {
    assertId(spec.id, "button");
    builder.setStyle(STYLES[spec.style ?? "secondary"]).setCustomId(spec.id);
  }
  if (spec.label !== undefined) builder.setLabel(clip(spec.label, LIMITS.buttonLabel));
  applyEmoji(builder, spec.emoji);
  if (spec.disabled) builder.setDisabled(true);
  return builder;
}

/** A discord.js string select from its spec. */
export function buildSelect(spec: SelectSpec): StringSelectMenuBuilder {
  assertId(spec.id, "select");
  const count = spec.options.length;
  if (count < 1 || count > LIMITS.selectOptions) {
    throw new UiBuildError(`a select needs 1-${LIMITS.selectOptions} options, got ${count}`);
  }
  const builder = new StringSelectMenuBuilder().setCustomId(spec.id);
  if (spec.placeholder !== undefined) {
    builder.setPlaceholder(clip(spec.placeholder, LIMITS.selectPlaceholder));
  }
  const seen = new Set<string>();
  for (const option of spec.options) {
    if (option.value.length < 1 || option.value.length > LIMITS.optionValue) {
      throw new UiBuildError(`select option value must be 1-${LIMITS.optionValue} characters`);
    }
    if (seen.has(option.value)) throw new UiBuildError(`duplicate select value "${option.value}"`);
    seen.add(option.value);
    const built = new StringSelectMenuOptionBuilder()
      .setLabel(clip(option.label, LIMITS.optionLabel))
      .setValue(option.value);
    if (option.description) {
      built.setDescription(clip(option.description, LIMITS.optionDescription));
    }
    applyEmoji(built, option.emoji);
    if (option.default) built.setDefault(true);
    builder.addOptions(built);
  }
  if (spec.minValues !== undefined) builder.setMinValues(Math.max(0, spec.minValues));
  if (spec.maxValues !== undefined) builder.setMaxValues(Math.min(count, spec.maxValues));
  if (spec.disabled) builder.setDisabled(true);
  return builder;
}

/**
 * One Action Row: up to 5 buttons (links included), or exactly one select, never both. Falsy
 * items are skipped. Throws `UiBuildError` for an empty row, a mixed row, or too many buttons.
 */
export function actions(...items: ActionItem[]): UiRow {
  const specs = items.filter((item): item is ActionSpec => Boolean(item));
  if (specs.length === 0) throw new UiBuildError("an action row cannot be empty");
  const row: UiRow = new ActionRowBuilder();
  const selects = specs.filter((spec) => spec.type === "select");
  if (selects.length > 0) {
    if (specs.length > 1) {
      throw new UiBuildError("a select menu takes a whole action row: it cannot share it");
    }
    return row.addComponents(buildSelect(selects[0] as SelectSpec));
  }
  if (specs.length > LIMITS.buttonsPerRow) {
    throw new UiBuildError(`an action row holds ${LIMITS.buttonsPerRow} buttons at most`);
  }
  return row.addComponents(specs.map((spec) => buildButton(spec as ButtonSpec | LinkSpec)));
}
