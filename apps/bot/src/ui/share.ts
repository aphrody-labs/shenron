// SPDX-License-Identifier: Apache-2.0
/**
 * "Share" button: turns a personal (ephemeral) answer into a public message, on purpose (D2 of
 * the redesign: a reply is private by default, public only through an explicit button).
 *
 * The ephemeral view is never copied as is. The button carries a `kind` and a compact `ctx`;
 * the handler registered for the kind builds the **public variant** (no balance, no private
 * counters) and the click posts it in the channel as a new message, then confirms to the member
 * in private.
 *
 *   registerShare("scan", async ({ ctx, lang }) => publicScanCard(ctx[0]!, lang));
 *   actions(shareButton({ kind: "scan", lang, owner: userId, ctx: [targetId] }))
 *
 * State is in the `custom_id` (`ui.sh:v1:<kind>:<expiry>:<owner>:<ctx…>`). A member can share the
 * same view once per `SHARE_COOLDOWN_MS` in a channel, so the button cannot be used to flood.
 */
import type { ButtonInteraction } from "discord.js";
import { interactionLang, t, type BotLang } from "~/lib/i18n";
import { logger } from "~/lib/logger";
import { button, type ButtonSpec } from "./actions";
import { customId, parseCustomId, type CustomIdArg } from "./custom-id";
import { botNoiseMeter } from "./noise-meter";
import { notice } from "./notice";
import { defer, edit, replyPayload, reply, sendPayload, toMessage, type UiInput } from "./respond";
import { assertKind, decodeExpiry, encodeExpiry, gate, ownerArg } from "./state";

export const SHARE_NS = "ui.sh";
export const SHARE_VERSION = 1;
export const SHARE_COOLDOWN_MS = 30_000;

export interface ShareButtonOptions {
  /** Key of the builder registered with `registerShare()`. */
  kind: string;
  lang: BotLang;
  /** Only this user may share (the member the ephemeral view belongs to). */
  owner?: string;
  /** Compact state handed back to the builder (the member, the item…). */
  ctx?: readonly CustomIdArg[];
  /** The button stops working this long after the message is built. Default: never. */
  ttlMs?: number;
  now?: number;
}

/** The share button, as a spec for `actions()` (it can share a row with other buttons). */
export function shareButton(options: ShareButtonOptions): ButtonSpec {
  return button({
    id: customId(
      SHARE_NS,
      SHARE_VERSION,
      assertKind(options.kind),
      encodeExpiry(options.ttlMs, options.now),
      ownerArg(options.owner),
      ...(options.ctx ?? []),
    ),
    label: t(options.lang, "ui.button.share"),
    emoji: "📣",
    style: "secondary",
  });
}

export interface ShareRequest {
  /** Language of the member who clicked; pick the server language for the public variant. */
  lang: BotLang;
  ctx: string[];
  userId: string;
  interaction: ButtonInteraction;
}
/** Builds the public variant, or `null` when there is nothing to share any more. */
export type ShareBuilder = (request: ShareRequest) => Promise<UiInput | null> | UiInput | null;

const builders = new Map<string, ShareBuilder>();

/** Declares the public variant of `kind`. A kind is registered once. */
export function registerShare(kind: string, builder: ShareBuilder): void {
  assertKind(kind);
  const known = builders.get(kind);
  if (known && known !== builder) throw new Error(`share "${kind}" is already registered`);
  builders.set(kind, builder);
}

/** Test hook: forgets a registered builder. */
export function unregisterShare(kind: string): void {
  builders.delete(kind);
}

const lastShare = new Map<string, number>();

/** Test hook: forgets the cooldowns. */
export function resetShareCooldowns(): void {
  lastShare.clear();
}

/** Remembers a share and tells whether the member is still cooling down. */
function coolingDown(key: string, now: number): boolean {
  const last = lastShare.get(key);
  if (last !== undefined && now - last < SHARE_COOLDOWN_MS) return true;
  lastShare.set(key, now);
  if (lastShare.size > 1_000) {
    for (const [k, at] of lastShare) if (now - at >= SHARE_COOLDOWN_MS) lastShare.delete(k);
  }
  return false;
}

/** Answers a click on a share button. Returns `false` when the id is not a share id. */
export async function handleShareButton(
  interaction: ButtonInteraction,
  now = Date.now(),
): Promise<boolean> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.ns !== SHARE_NS) return false;
  const lang = interactionLang(interaction);
  const [kind, expiry, owner, ...ctx] = parsed.args;
  const builder = kind ? builders.get(kind) : undefined;
  const verdict = gate(
    { expiresAt: decodeExpiry(expiry), owner: owner || undefined },
    interaction.user.id,
    now,
  );
  if (parsed.version !== SHARE_VERSION || !builder || verdict === "expired") {
    await reply(interaction, notice(lang, "error", "ui.expired"));
    return true;
  }
  if (verdict === "not-owner") {
    await reply(interaction, notice(lang, "error", "ui.notYours"));
    return true;
  }
  const key = [interaction.user.id, interaction.channelId, kind, ...ctx].join(":");
  if (coolingDown(key, now)) {
    await reply(interaction, notice(lang, "info", "ui.shareCooldown"));
    return true;
  }

  // Acknowledge first: the public variant may need a render longer than the 3 s token.
  await defer(interaction);
  try {
    const view = await builder({ lang, ctx, userId: interaction.user.id, interaction });
    if (!view) {
      await edit(interaction, notice(lang, "error", "ui.shareFailed"));
      return true;
    }
    const message = { ...toMessage(view), public: true };
    const channel = interaction.channel;
    if (channel && "send" in channel && typeof channel.send === "function") {
      botNoiseMeter.hint(channel.id, "share");
      await channel.send(sendPayload(message));
    } else {
      await interaction.followUp({ ...replyPayload(message) });
    }
    await edit(interaction, notice(lang, "success", "ui.shared"));
  } catch (err) {
    logger.warn({ err, kind }, "[ui] share failed");
    await edit(interaction, notice(lang, "error", "ui.shareFailed")).catch(() => {});
  }
  return true;
}
