// SPDX-License-Identifier: Apache-2.0
/**
 * Replying with Components V2: payload builders and the interaction helpers.
 *
 * Rules the helpers apply so a command cannot get them wrong (`docs/products/
 * bot-discord-refonte.md` §3.1, §4.2):
 *
 *  - every payload carries `IsComponentsV2`, never `content` or `embeds` (a V2 message cannot);
 *  - a personal return is **ephemeral by default** (D2): a message is public only when the caller
 *    says `public: true`;
 *  - `allowedMentions` is `{ parse: [] }` unless the caller opts in (a mention renders but never
 *    pings);
 *  - after `deferReply()` the visibility is fixed by the acknowledgement, so the edit only adds the
 *    V2 flag (Discord accepts `Ephemeral` on the acknowledgement and `IsComponentsV2` on the edit);
 *  - an edit clears `content` and `embeds` (a legacy message can become V2, not the reverse) and
 *    replaces the attachments, so an image of the previous view does not linger;
 *  - the payload is validated first: a limit break fails here, with a path, rather than as one
 *    generic Discord error for the whole reply.
 */
import {
  MessageFlags,
  type AttachmentBuilder,
  type CommandInteraction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type MessageCreateOptions,
  type MessageMentionOptions,
  type RepliableInteraction,
} from "discord.js";
import type { UiComponent } from "./blocks";
import { assertValid } from "./validate";

/** Any interaction a reply can be given to (slash commands are typed `CommandInteraction`). */
export type UiInteraction = RepliableInteraction | CommandInteraction;

export interface UiMessage {
  components: readonly UiComponent[];
  /** Files referenced by the components (`canvasFile()`): see `media()`. */
  files?: readonly AttachmentBuilder[];
  /** Visible to the channel. Default `false`: ephemeral, for the member who ran the command. */
  public?: boolean;
  /** `SuppressNotifications`: for a message that will be edited later (a live view, a feed). */
  silent?: boolean;
  /** Default `{ parse: [] }`: mentions render without pinging. */
  allowedMentions?: MessageMentionOptions;
}

/** A whole message, one component, or a list of components. */
export type UiInput = UiMessage | UiComponent | readonly UiComponent[];

const NO_PINGS: MessageMentionOptions = { parse: [] };

function isComponent(value: unknown): value is UiComponent {
  return typeof value === "object" && value !== null && "toJSON" in value;
}

/** Normalises any input to a `UiMessage`. */
export function toMessage(input: UiInput): UiMessage {
  if (Array.isArray(input)) return { components: input as readonly UiComponent[] };
  if (isComponent(input)) return { components: [input] };
  return input as UiMessage;
}

function checked(message: UiMessage) {
  const files = [...(message.files ?? [])];
  assertValid({ components: message.components, files });
  return { components: [...message.components], files };
}

function mentions(message: UiMessage): MessageMentionOptions {
  return message.allowedMentions ?? NO_PINGS;
}

/** Payload of a new interaction reply or follow-up (ephemeral unless `public`). */
export function replyPayload(input: UiInput): InteractionReplyOptions {
  const message = toMessage(input);
  const { components, files } = checked(message);
  let flags: number = MessageFlags.IsComponentsV2;
  if (!message.public) flags |= MessageFlags.Ephemeral;
  if (message.silent) flags |= MessageFlags.SuppressNotifications;
  return { components, files, flags, allowedMentions: mentions(message) };
}

/**
 * Payload of an edit (`editReply`, `update`): the V2 flag only (visibility cannot change),
 * `content` and `embeds` cleared, attachments replaced by exactly the given files.
 */
export function editPayload(
  input: UiInput,
): InteractionEditReplyOptions & InteractionUpdateOptions {
  const message = toMessage(input);
  const { components, files } = checked(message);
  return {
    components,
    files,
    attachments: [],
    content: null,
    embeds: [],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: mentions(message),
  };
}

/** Payload of a plain channel message (`channel.send`): always public. */
export function sendPayload(input: UiInput): MessageCreateOptions {
  const message = toMessage(input);
  const { components, files } = checked(message);
  let flags: number = MessageFlags.IsComponentsV2;
  if (message.silent) flags |= MessageFlags.SuppressNotifications;
  return { components, files, flags, allowedMentions: mentions(message) };
}

/**
 * Acknowledges now to answer later (`reply()` / `edit()` then complete it). Ephemeral unless
 * `public`, because the acknowledgement fixes the visibility of the reply.
 */
export async function defer(
  interaction: UiInteraction,
  { public: isPublic = false }: { public?: boolean } = {},
): Promise<void> {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply(isPublic ? {} : { flags: MessageFlags.Ephemeral });
}

/**
 * The answer to an interaction, whatever its state: the first answer is `reply()`, the edit of a
 * deferred acknowledgement is `editReply()`, anything after is a `followUp()`.
 */
export async function reply(interaction: UiInteraction, input: UiInput): Promise<unknown> {
  if (interaction.replied) return interaction.followUp(replyPayload(input));
  if (interaction.deferred) return interaction.editReply(editPayload(input));
  return interaction.reply(replyPayload(input));
}

/** An extra message after the first answer (ephemeral unless `public`). */
export async function followUp(interaction: UiInteraction, input: UiInput): Promise<unknown> {
  return interaction.followUp(replyPayload(input));
}

/**
 * Replaces the message a component or a modal was attached to (`update`), or the reply already
 * given (`editReply`) when the interaction was acknowledged or has no message to update.
 */
export async function edit(interaction: UiInteraction, input: UiInput): Promise<unknown> {
  const fromMessage =
    interaction.isMessageComponent() ||
    (interaction.isModalSubmit() && interaction.isFromMessage());
  if (fromMessage && !interaction.replied && !interaction.deferred) {
    return interaction.update(editPayload(input));
  }
  return interaction.editReply(editPayload(input));
}
