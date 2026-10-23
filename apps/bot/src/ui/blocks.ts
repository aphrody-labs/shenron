// SPDX-License-Identifier: Apache-2.0
/**
 * Leaf and branch blocks of a Components V2 message: text, separator, media gallery, section and
 * the canvas attachment helper. They return discord.js builders; `card()` and the reply helpers
 * assemble them, `validate()` checks the result against Discord's limits.
 */
import {
  AttachmentBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type APIMediaGalleryItem,
} from "discord.js";
import { buildButton, type ButtonSpec, type LinkSpec, type UiRow } from "./actions";
import { UiBuildError } from "./errors";
import { LIMITS, clip } from "./limits";

/** What a Container may hold (it cannot hold another Container). */
export type ContainerChild =
  | TextDisplayBuilder
  | SectionBuilder
  | MediaGalleryBuilder
  | SeparatorBuilder
  | FileBuilder
  | UiRow;
/** What a message may hold at its top level. */
export type UiComponent = ContainerBuilder | ContainerChild;

/** One Text Display; an array is joined with line breaks. Throws on empty text. */
export function text(content: string | readonly string[]): TextDisplayBuilder {
  const joined = (typeof content === "string" ? content : content.join("\n")).trim();
  if (joined.length === 0) throw new UiBuildError("a text display cannot be empty");
  return new TextDisplayBuilder().setContent(clip(joined, LIMITS.textTotal));
}

export interface SeparatorOptions {
  /** Vertical space around the line; default `small`. */
  spacing?: "small" | "large";
  /** Draw the visible line; default `true`. */
  divider?: boolean;
}

export function separator({ spacing = "small", divider = true }: SeparatorOptions = {}) {
  return new SeparatorBuilder()
    .setSpacing(spacing === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small)
    .setDivider(divider);
}

export interface MediaItem {
  /** `https://…` or `attachment://<file name>` (see `canvasFile()`). */
  url: string;
  /** Alt text, clipped to 1 024 characters. */
  description?: string;
  spoiler?: boolean;
}
export type MediaInput = MediaItem | string;
export type ThumbnailInput = MediaInput;

const MEDIA_URL = /^(?:https?|attachment):\/\/\S+$/i;

function asItem(input: MediaInput): MediaItem {
  const item = typeof input === "string" ? { url: input } : input;
  if (!MEDIA_URL.test(item.url)) {
    throw new UiBuildError(`media url must be http(s):// or attachment://, got "${item.url}"`);
  }
  return item;
}

/** A gallery of 1 to 10 images (URLs or `attachment://` references). */
export function media(input: MediaInput | readonly MediaInput[]): MediaGalleryBuilder {
  const inputs: readonly MediaInput[] = Array.isArray(input) ? input : [input as MediaInput];
  if (inputs.length < 1 || inputs.length > LIMITS.gallery) {
    throw new UiBuildError(`a media gallery holds 1-${LIMITS.gallery} items, got ${inputs.length}`);
  }
  const items: APIMediaGalleryItem[] = [];
  for (const entry of inputs) {
    const item = asItem(entry);
    const built: APIMediaGalleryItem = { media: { url: item.url } };
    if (item.description) built.description = clip(item.description, LIMITS.mediaDescription);
    if (item.spoiler) built.spoiler = true;
    items.push(built);
  }
  return new MediaGalleryBuilder().addItems(items);
}

export function thumbnail(input: ThumbnailInput): ThumbnailBuilder {
  const item = asItem(input);
  const builder = new ThumbnailBuilder().setURL(item.url);
  if (item.description) builder.setDescription(clip(item.description, LIMITS.mediaDescription));
  if (item.spoiler) builder.setSpoiler(true);
  return builder;
}

export type SectionOptions = { lines: readonly string[] } & (
  | { thumbnail: ThumbnailInput; button?: never }
  | { button: ButtonSpec | LinkSpec; thumbnail?: never }
);

/**
 * 1 to 3 lines of text beside exactly one accessory: a thumbnail or a button. (A Section
 * without accessory is invalid for Discord: use `text()` for plain text.)
 */
export function section(options: SectionOptions): SectionBuilder {
  const lines = options.lines.filter((line) => line.trim().length > 0);
  if (lines.length < 1 || lines.length > LIMITS.sectionTexts) {
    throw new UiBuildError(
      `a section holds 1-${LIMITS.sectionTexts} text lines, got ${lines.length}`,
    );
  }
  const built = new SectionBuilder().addTextDisplayComponents(lines.map((line) => text(line)));
  if (options.thumbnail !== undefined)
    return built.setThumbnailAccessory(thumbnail(options.thumbnail));
  if (options.button !== undefined) return built.setButtonAccessory(buildButton(options.button));
  throw new UiBuildError("a section needs a thumbnail or a button accessory");
}

const ATTACHMENT_NAME = /^[\w][\w.-]{0,99}$/;

/** `attachment://<name>` for a file sent with the message. */
export function attachmentUrl(name: string): string {
  if (!ATTACHMENT_NAME.test(name)) {
    throw new UiBuildError(`attachment name must be a plain file name, got "${name}"`);
  }
  return `attachment://${name}`;
}

export interface CanvasFile {
  /** Goes in the `files` of the message. */
  file: AttachmentBuilder;
  /** `attachment://<name>`: what `media()` / `thumbnail()` reference. */
  url: string;
  name: string;
}

/**
 * An image rendered by the bot (canvas card) attached to the message. In a V2 message an
 * attachment shows only if a component references it: pass `url` to `media()` and `file` in the
 * `files` of the reply; `validate()` rejects a missing or unreferenced file.
 */
export function canvasFile(
  data: Buffer | Uint8Array,
  name: string,
  description?: string,
): CanvasFile {
  const url = attachmentUrl(name);
  const file = new AttachmentBuilder(Buffer.from(data), { name });
  if (description) file.setDescription(clip(description, LIMITS.mediaDescription));
  return { file, url, name };
}
