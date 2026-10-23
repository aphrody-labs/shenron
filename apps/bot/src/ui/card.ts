// SPDX-License-Identifier: Apache-2.0
/**
 * `card()`: the one Container every rich answer is made of. Layout, top to bottom:
 *
 *   1. header: `## title` and the `lines`, as one Text Display, or as a Section when a
 *      `thumbnail` sits beside it;
 *   2. the media gallery (a canvas card, images);
 *   3. any extra `blocks` (sections, texts, separators), in order;
 *   4. the `footer`, small grey text;
 *   5. a divider and the action rows (buttons, select, pager).
 *
 * The coloured bar on the left is the domain accent (`ACCENT_COLORS`).
 */
import { ContainerBuilder } from "discord.js";
import { resolveAccent, type AccentInput } from "./accent";
import type { UiRow } from "./actions";
import { media, section, separator, text } from "./blocks";
import type { ContainerChild, MediaInput, ThumbnailInput } from "./blocks";
import { UiBuildError } from "./errors";

type Maybe<T> = T | null | undefined | false;

export interface CardOptions {
  /** Domain accent or an explicit RGB colour (a race, a tier). Default: the Shenron brand. */
  accent?: AccentInput;
  /** Rendered as a level-2 heading. Line breaks collapse. */
  title?: string;
  /** Short lines under the title, one Text Display (joined with line breaks). */
  lines?: readonly string[];
  /** Image beside the header; needs a title or lines. */
  thumbnail?: ThumbnailInput;
  media?: MediaInput | readonly MediaInput[];
  /** Extra blocks between the media and the footer: `section()`, `text()`, `separator()`. */
  blocks?: readonly Maybe<ContainerChild>[];
  /** Small text under the content (`-# …`). */
  footer?: string;
  /** Rows of buttons or selects (`actions()`, `paginate()`, `confirm()`), after a divider. */
  actions?: Maybe<UiRow> | readonly Maybe<UiRow>[];
  /** Hide the whole card behind a spoiler. */
  spoiler?: boolean;
}

function present<T>(value: Maybe<T>): value is T {
  return Boolean(value);
}

/** Dispatches a block to the matching `add…Components` so the order is preserved. */
function append(container: ContainerBuilder, block: ContainerChild): void {
  // `data.type` is the API component type (works across duplicated builder packages).
  const type = (block.data as { type?: number }).type;
  switch (type) {
    case 1:
      container.addActionRowComponents(block as UiRow);
      return;
    case 9:
      container.addSectionComponents(block as never);
      return;
    case 10:
      container.addTextDisplayComponents(block as never);
      return;
    case 12:
      container.addMediaGalleryComponents(block as never);
      return;
    case 13:
      container.addFileComponents(block as never);
      return;
    case 14:
      container.addSeparatorComponents(block as never);
      return;
    default:
      throw new UiBuildError(`a card cannot hold a component of type ${type}`);
  }
}

export function card(options: CardOptions = {}): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(resolveAccent(options.accent));
  if (options.spoiler) container.setSpoiler(true);

  const headerLines = [
    options.title ? `## ${options.title.replace(/\s*\n\s*/g, " ").trim()}` : null,
    ...(options.lines ?? []),
  ].filter((line): line is string => line !== null && line.trim().length > 0);

  let count = 0;
  if (headerLines.length > 0) {
    append(
      container,
      options.thumbnail !== undefined
        ? section({ lines: [headerLines.join("\n")], thumbnail: options.thumbnail })
        : text(headerLines),
    );
    count += 1;
  } else if (options.thumbnail !== undefined) {
    throw new UiBuildError("a card thumbnail needs a title or lines beside it");
  }

  if (options.media !== undefined) {
    append(container, media(options.media));
    count += 1;
  }
  for (const block of (options.blocks ?? []).filter(present)) {
    append(container, block);
    count += 1;
  }
  if (options.footer && options.footer.trim().length > 0) {
    append(container, text(`-# ${options.footer.replace(/\s*\n\s*/g, " ").trim()}`));
    count += 1;
  }

  const given = options.actions;
  const rows = (
    Array.isArray(given) ? (given as readonly Maybe<UiRow>[]) : [given as Maybe<UiRow>]
  ).filter(present);
  if (rows.length > 0) {
    if (count > 0) append(container, separator());
    for (const row of rows) append(container, row);
    count += rows.length;
  }

  if (count === 0) throw new UiBuildError("an empty card: give it a title, lines, media or blocks");
  return container;
}
