// SPDX-License-Identifier: Apache-2.0
/**
 * Validation of a Components V2 payload against the Discord limits, before it is sent.
 *
 * A bad payload costs a whole reply (Discord answers one generic 50035 for the entire message),
 * so the reply helpers run `assertValid()` on every payload and the tests run `validate()` on
 * every view. It works on the API JSON (`toJSON()` of the builders), the same bytes that would
 * go on the wire:
 *
 *  - at most 40 components, counted recursively (rows, buttons, texts, accessories, containers);
 *  - at most 4 000 characters of text in total, no empty text;
 *  - nesting rules: a Container holds rows, texts, sections, galleries, separators and files
 *    (never a Container); a Section holds 1-3 texts and one Button or Thumbnail; a row holds
 *    up to 5 buttons or one select; depth at most 3;
 *  - `custom_id` 1-100 characters and unique in the message, button labels at most 80, link
 *    buttons without `custom_id`, selects with 1-25 options;
 *  - every `attachment://` reference matches a file sent with the message, and every file is
 *    referenced (an unreferenced attachment of a V2 message is not shown);
 *  - no `content`, `embeds`, `poll` or `stickers`, and the `IsComponentsV2` flag.
 */
import {
  ComponentType,
  MessageFlags,
  type AttachmentBuilder,
  type JSONEncodable,
} from "discord.js";
import { LIMITS } from "./limits";

export type IssueCode =
  | "builder"
  | "components"
  | "text-total"
  | "empty-text"
  | "depth"
  | "structure"
  | "custom-id"
  | "duplicate-id"
  | "label"
  | "url"
  | "options"
  | "attachment"
  | "payload";

export interface UiIssue {
  code: IssueCode;
  /** Where in the message, e.g. `components[0].components[2].accessory`. */
  path: string;
  message: string;
}

export interface UiAnalysis {
  issues: UiIssue[];
  /** Components counted the way Discord counts them (recursive). */
  components: number;
  /** Sum of the Text Display contents. */
  textLength: number;
  /** Deepest nesting level reached (a top-level component is 1). */
  depth: number;
  customIds: string[];
}

export class UiValidationError extends Error {
  override name = "UiValidationError";
  constructor(readonly issues: readonly UiIssue[]) {
    super(
      `invalid Components V2 payload (${issues.length} issue${issues.length === 1 ? "" : "s"}): ` +
        issues
          .slice(0, 5)
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join("; "),
    );
  }
}

type Json = Record<string, unknown> & { type?: number };
type Parent = "top" | "container" | "section" | "row";

const T = ComponentType;
const CONTAINER_CHILDREN = new Set<number>([
  T.ActionRow,
  T.TextDisplay,
  T.Section,
  T.MediaGallery,
  T.Separator,
  T.File,
]);
const TOP_LEVEL = new Set<number>([T.Container, ...CONTAINER_CHILDREN]);
const SELECTS = new Set<number>([
  T.StringSelect,
  T.UserSelect,
  T.RoleSelect,
  T.MentionableSelect,
  T.ChannelSelect,
]);
const LINK_STYLE = 5;
const PREMIUM_STYLE = 6;
const ATTACHMENT = /^attachment:\/\/(.+)$/;

const asJson = (value: unknown): Json => (value ?? {}) as Json;
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The API JSON of a builder, or the object itself when it already is API JSON. */
function toApi(component: unknown): unknown {
  return component && typeof (component as JSONEncodable<unknown>).toJSON === "function"
    ? (component as JSONEncodable<unknown>).toJSON()
    : component;
}

export interface AnalyzeOptions {
  /** Names of the files sent with the message (for the `attachment://` cross-check). */
  files?: readonly string[];
}

/** Walks the components and reports every violation, plus the measured size. */
export function analyze(
  components: readonly unknown[],
  { files }: AnalyzeOptions = {},
): UiAnalysis {
  const issues: UiIssue[] = [];
  const customIds: string[] = [];
  const references = new Set<string>();
  let count = 0;
  let textLength = 0;
  let deepest = 0;

  const issue = (code: IssueCode, path: string, message: string) =>
    issues.push({ code, path, message });

  const checkMediaUrl = (url: unknown, path: string) => {
    if (typeof url !== "string" || url.length === 0) {
      issue("url", path, "media url is missing");
      return;
    }
    const reference = ATTACHMENT.exec(url);
    if (reference) references.add(decodeURIComponent(reference[1]!));
    else if (!/^https?:\/\//i.test(url)) issue("url", path, `unsupported media url "${url}"`);
  };

  const checkDescription = (description: unknown, path: string) => {
    if (typeof description === "string" && description.length > LIMITS.mediaDescription) {
      issue("label", `${path}.description`, `description over ${LIMITS.mediaDescription} chars`);
    }
  };

  const checkCustomId = (node: Json, path: string) => {
    const id = node.custom_id;
    if (typeof id !== "string" || id.length < 1 || id.length > LIMITS.customId) {
      issue("custom-id", path, `custom_id must be 1-${LIMITS.customId} characters`);
      return;
    }
    if (customIds.includes(id)) issue("duplicate-id", path, `custom_id "${id}" is used twice`);
    customIds.push(id);
  };

  const visit = (raw: unknown, depth: number, path: string, parent: Parent): void => {
    const node = asJson(raw);
    count += 1;
    deepest = Math.max(deepest, depth);
    if (depth > LIMITS.depth) issue("depth", path, `nested deeper than ${LIMITS.depth} levels`);

    switch (node.type) {
      case T.Container: {
        if (parent !== "top") issue("structure", path, "a container cannot be nested");
        const color = node.accent_color;
        if (
          color !== undefined &&
          color !== null &&
          (!Number.isInteger(color) || (color as number) < 0 || (color as number) > 0xffffff)
        ) {
          issue("structure", `${path}.accent_color`, "accent colour must be 0x000000-0xffffff");
        }
        const children = asList(node.components);
        if (children.length === 0) issue("structure", path, "a container needs a child");
        children.forEach((child, i) => {
          const childPath = `${path}.components[${i}]`;
          const type = asJson(child).type;
          if (type === undefined || !CONTAINER_CHILDREN.has(type)) {
            issue("structure", childPath, `a container cannot hold a component of type ${type}`);
          }
          visit(child, depth + 1, childPath, "container");
        });
        return;
      }
      case T.Section: {
        const texts = asList(node.components);
        if (texts.length < 1 || texts.length > LIMITS.sectionTexts) {
          issue("structure", path, `a section holds 1-${LIMITS.sectionTexts} texts`);
        }
        texts.forEach((child, i) => {
          const childPath = `${path}.components[${i}]`;
          if (asJson(child).type !== T.TextDisplay) {
            issue("structure", childPath, "a section holds text displays only");
          }
          visit(child, depth + 1, childPath, "section");
        });
        const accessory = asJson(node.accessory);
        if (accessory.type !== T.Button && accessory.type !== T.Thumbnail) {
          issue(
            "structure",
            `${path}.accessory`,
            "a section needs a button or thumbnail accessory",
          );
        } else {
          visit(accessory, depth + 1, `${path}.accessory`, "section");
        }
        return;
      }
      case T.ActionRow: {
        const children = asList(node.components);
        const kinds = children.map((child) => asJson(child).type as number);
        const hasSelect = kinds.some((kind) => SELECTS.has(kind));
        if (children.length === 0) issue("structure", path, "an action row cannot be empty");
        else if (hasSelect && children.length > 1) {
          issue("structure", path, "a select menu takes a whole action row");
        } else if (!hasSelect && children.length > LIMITS.buttonsPerRow) {
          issue("structure", path, `an action row holds ${LIMITS.buttonsPerRow} buttons at most`);
        }
        children.forEach((child, i) => {
          const childPath = `${path}.components[${i}]`;
          const type = asJson(child).type as number;
          if (type !== T.Button && !SELECTS.has(type)) {
            issue("structure", childPath, `an action row cannot hold a component of type ${type}`);
          }
          visit(child, depth + 1, childPath, "row");
        });
        return;
      }
      case T.Button: {
        const style = node.style;
        if (style === LINK_STYLE) {
          if (node.custom_id !== undefined) {
            issue("custom-id", path, "a link button has no custom_id");
          }
          const url = node.url;
          if (typeof url !== "string" || url.length === 0 || url.length > LIMITS.url) {
            issue("url", path, `link url must be 1-${LIMITS.url} characters`);
          }
        } else if (style !== PREMIUM_STYLE) {
          checkCustomId(node, path);
        }
        const label = node.label;
        if (typeof label === "string" && label.length > LIMITS.buttonLabel) {
          issue("label", path, `button label over ${LIMITS.buttonLabel} chars`);
        }
        if (style !== PREMIUM_STYLE && !label && !node.emoji) {
          issue("label", path, "a button needs a label or an emoji");
        }
        return;
      }
      case T.TextDisplay: {
        const content = node.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          issue("empty-text", path, "a text display cannot be empty");
        } else {
          textLength += content.length;
        }
        return;
      }
      case T.Thumbnail: {
        checkMediaUrl(asJson(node.media).url, `${path}.media`);
        checkDescription(node.description, path);
        return;
      }
      case T.MediaGallery: {
        const items = asList(node.items);
        if (items.length < 1 || items.length > LIMITS.gallery) {
          issue("structure", path, `a media gallery holds 1-${LIMITS.gallery} items`);
        }
        items.forEach((item, i) => {
          const itemPath = `${path}.items[${i}]`;
          checkMediaUrl(asJson(asJson(item).media).url, `${itemPath}.media`);
          checkDescription(asJson(item).description, itemPath);
        });
        return;
      }
      case T.File: {
        const url = asJson(node.file).url;
        if (typeof url !== "string" || !ATTACHMENT.test(url)) {
          issue("url", `${path}.file`, "a file component must reference an attachment://");
        } else checkMediaUrl(url, `${path}.file`);
        return;
      }
      case T.Separator: {
        const spacing = node.spacing;
        if (spacing !== undefined && spacing !== 1 && spacing !== 2) {
          issue("structure", path, "separator spacing must be 1 or 2");
        }
        return;
      }
      default: {
        if (SELECTS.has(node.type as number)) {
          checkCustomId(node, path);
          const placeholder = node.placeholder;
          if (typeof placeholder === "string" && placeholder.length > LIMITS.selectPlaceholder) {
            issue("label", path, `placeholder over ${LIMITS.selectPlaceholder} chars`);
          }
          if (node.type === T.StringSelect) {
            const options = asList(node.options);
            if (options.length < 1 || options.length > LIMITS.selectOptions) {
              issue("options", path, `a select needs 1-${LIMITS.selectOptions} options`);
            }
            const values = new Set<unknown>();
            options.forEach((option, i) => {
              const o = asJson(option);
              const optionPath = `${path}.options[${i}]`;
              const label = String(o.label ?? "");
              const value = String(o.value ?? "");
              if (label.length < 1 || label.length > LIMITS.optionLabel) {
                issue("options", optionPath, `option label must be 1-${LIMITS.optionLabel} chars`);
              }
              if (value.length < 1 || value.length > LIMITS.optionValue) {
                issue("options", optionPath, `option value must be 1-${LIMITS.optionValue} chars`);
              }
              if (String(o.description ?? "").length > LIMITS.optionDescription) {
                issue("options", optionPath, `description over ${LIMITS.optionDescription} chars`);
              }
              if (values.has(o.value)) issue("options", optionPath, `duplicate value "${value}"`);
              values.add(o.value);
            });
          }
          return;
        }
        issue("structure", path, `unsupported component type ${node.type}`);
      }
    }
  };

  components.forEach((component, i) => {
    let api: unknown;
    try {
      api = toApi(component);
    } catch (err) {
      issue("builder", `components[${i}]`, err instanceof Error ? err.message : String(err));
      return;
    }
    const type = asJson(api).type;
    if (type === undefined || !TOP_LEVEL.has(type)) {
      issue("structure", `components[${i}]`, `type ${type} cannot be at the top level`);
    }
    visit(api, 1, `components[${i}]`, "top");
  });

  if (count > LIMITS.components) {
    issue("components", "components", `${count} components (max ${LIMITS.components})`);
  }
  if (textLength > LIMITS.textTotal) {
    issue("text-total", "components", `${textLength} characters of text (max ${LIMITS.textTotal})`);
  }
  if (files) {
    const sent = new Set(files);
    for (const name of references) {
      if (!sent.has(name)) {
        issue("attachment", "components", `attachment://${name} is not sent with the message`);
      }
    }
    for (const name of sent) {
      if (!references.has(name)) {
        issue("attachment", "files", `file "${name}" is attached but no component shows it`);
      }
    }
  }
  return { issues, components: count, textLength, depth: deepest, customIds };
}

export interface ValidatePayload {
  components: readonly unknown[];
  /** Files sent with the message: builders or plain names. */
  files?: readonly (AttachmentBuilder | string)[];
  /** Message flags when already resolved; `IsComponentsV2` must be among them. */
  flags?: number;
  content?: unknown;
  embeds?: readonly unknown[];
  poll?: unknown;
  stickers?: readonly unknown[];
}

/** Every violation of `payload` (an empty list means it is sendable). */
export function validate(payload: ValidatePayload): UiIssue[] {
  const names = payload.files?.map((file) => (typeof file === "string" ? file : (file.name ?? "")));
  const { issues } = analyze(payload.components, { files: names });
  const extra = (message: string) => issues.push({ code: "payload", path: "payload", message });
  if (payload.content) extra("a Components V2 message cannot have content: use a text display");
  if (payload.embeds && payload.embeds.length > 0) {
    extra("a Components V2 message cannot have embeds");
  }
  if (payload.poll) extra("a Components V2 message cannot have a poll");
  if (payload.stickers && payload.stickers.length > 0) {
    extra("a Components V2 message cannot have stickers");
  }
  if (payload.flags !== undefined && (payload.flags & MessageFlags.IsComponentsV2) === 0) {
    extra("the IsComponentsV2 flag is missing");
  }
  if (payload.components.length === 0) {
    issues.push({ code: "structure", path: "components", message: "the message has no component" });
  }
  return issues;
}

/** Throws `UiValidationError` when `payload` breaks a limit. */
export function assertValid(payload: ValidatePayload): void {
  const issues = validate(payload);
  if (issues.length > 0) throw new UiValidationError(issues);
}
