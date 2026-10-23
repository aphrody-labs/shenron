// SPDX-License-Identifier: Apache-2.0
/**
 * Two-button confirmation for a destructive or costly action (a purchase, a sanction, a reset).
 * Anything reversible should act at once instead (D2 of the redesign: no confirmation for the
 * sake of it).
 *
 *   // once, at module load: what "confirm" does (returns the view that replaces the prompt)
 *   registerConfirm("buy", async ({ ctx, userId, lang }) => purchaseView(userId, ctx[0]!, lang));
 *   // in the command: the prompt, with the item in the id
 *   card({ title: "…", actions: confirm({ kind: "buy", lang, owner: userId, ctx: [itemKey] }) });
 *
 * State is in the `custom_id` (`ui.cf:v1:<kind>:<yes|no>:<expiry>:<owner>:<ctx…>`), so a pending
 * confirmation survives a restart; it expires after `CONFIRM_TTL_MS` by default, so an old
 * message cannot trigger a charge hours later.
 */
import type { ButtonInteraction } from "discord.js";
import { interactionLang, t, type BotLang } from "~/lib/i18n";
import { actions, button, type UiRow } from "./actions";
import { customId, parseCustomId, type CustomIdArg } from "./custom-id";
import { notice } from "./notice";
import { edit, reply, type UiInput } from "./respond";
import { assertKind, decodeExpiry, encodeExpiry, gate, ownerArg } from "./state";

export const CONFIRM_NS = "ui.cf";
export const CONFIRM_VERSION = 1;
export const CONFIRM_TTL_MS = 10 * 60_000;

export interface ConfirmOptions {
  /** Key of the handler registered with `registerConfirm()`. */
  kind: string;
  lang: BotLang;
  /** Only this user may answer; anyone otherwise. */
  owner?: string;
  /** Compact state handed back to the handler. */
  ctx?: readonly CustomIdArg[];
  /** Default 10 minutes. */
  ttlMs?: number;
  now?: number;
  /** Style of the confirm button: `danger` (default) or `primary` for a costly but safe action. */
  style?: "danger" | "primary";
}

/** The row with the confirm and cancel buttons. */
export function confirm(options: ConfirmOptions): UiRow {
  const id = (answer: "yes" | "no") =>
    customId(
      CONFIRM_NS,
      CONFIRM_VERSION,
      assertKind(options.kind),
      answer,
      encodeExpiry(options.ttlMs ?? CONFIRM_TTL_MS, options.now),
      ownerArg(options.owner),
      ...(options.ctx ?? []),
    );
  return actions(
    button({
      id: id("yes"),
      label: t(options.lang, "ui.button.confirm"),
      emoji: "✅",
      style: options.style ?? "danger",
    }),
    button({
      id: id("no"),
      label: t(options.lang, "ui.button.cancel"),
      emoji: "✖️",
      style: "secondary",
    }),
  );
}

export interface ConfirmRequest {
  lang: BotLang;
  ctx: string[];
  userId: string;
  interaction: ButtonInteraction;
}
/**
 * Runs the confirmed action. Return the view that replaces the confirmation message, or
 * nothing when the handler answered the interaction itself.
 */
export type ConfirmHandler = (request: ConfirmRequest) => Promise<UiInput | void> | UiInput | void;

const handlers = new Map<string, ConfirmHandler>();

/** Declares what "confirm" does for `kind`. A kind is registered once. */
export function registerConfirm(kind: string, handler: ConfirmHandler): void {
  assertKind(kind);
  const known = handlers.get(kind);
  if (known && known !== handler) throw new Error(`confirm "${kind}" is already registered`);
  handlers.set(kind, handler);
}

/** Test hook: forgets a registered handler. */
export function unregisterConfirm(kind: string): void {
  handlers.delete(kind);
}

/** Answers a click on the confirm row. Returns `false` when the id is not a confirm id. */
export async function handleConfirmButton(
  interaction: ButtonInteraction,
  now = Date.now(),
): Promise<boolean> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.ns !== CONFIRM_NS) return false;
  const lang = interactionLang(interaction);
  const [kind, answer, expiry, owner, ...ctx] = parsed.args;
  const handler = kind ? handlers.get(kind) : undefined;
  const valid = parsed.version === CONFIRM_VERSION && (answer === "yes" || answer === "no");
  const verdict = gate(
    { expiresAt: decodeExpiry(expiry), owner: owner || undefined },
    interaction.user.id,
    now,
  );
  if (!valid || !handler || verdict === "expired") {
    await reply(interaction, notice(lang, "error", "ui.expired"));
    return true;
  }
  if (verdict === "not-owner") {
    await reply(interaction, notice(lang, "error", "ui.notYours"));
    return true;
  }
  if (answer === "no") {
    await edit(interaction, notice(lang, "info", "ui.cancelled"));
    return true;
  }
  const view = await handler({ lang, ctx, userId: interaction.user.id, interaction });
  if (view) await edit(interaction, view);
  else if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
  return true;
}
