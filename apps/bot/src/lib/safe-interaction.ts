import type { BaseInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { botLang, t } from "~/lib/i18n";

/**
 * Interaction dispatcher with a fallback reply that cannot collide with other handlers.
 *
 * It replaces `safeExecuteInteraction` of `@aphrody/discord-kit` (same contract: errors are
 * logged, a deferred interaction that failed is edited, an unanswered one gets an ephemeral
 * reply), which has two production defects:
 *
 *  - It judges "not acknowledged yet" from `interaction.replied/deferred`, flags that only turn
 *    true once the REST call has returned. A button of a `@discordx/pagination` message is
 *    answered by that library's own collector, not by a discordx handler: discordx logs
 *    "button component handler not found", the kit sees no acknowledgement and replies too,
 *    and Discord refuses with 40060 "Interaction has already been acknowledged" (logged as a
 *    failure). Here a component interaction nobody answered is given a moment for a collector
 *    to acknowledge it before the fallback speaks.
 *  - A pagination whose collector is gone (expired, or lost at a restart) produced a generic
 *    "unknown command" message. It now says the pagination expired.
 *
 * An acknowledgement that raced ours (40060) or a token that expired (10062) is expected
 * traffic, not a failure.
 */

/** Custom ids of the buttons `@discordx/pagination` builds (`discordx@pagination@next`…). */
export const PAGINATION_CUSTOM_ID = /^discordx@pagination@/;
/** Time a collector gets to acknowledge a component interaction (the token lives 3 s). */
export const COLLECTOR_GRACE_MS = 1_500;
const POLL_MS = 100;

const ALREADY_ACKNOWLEDGED = 40060;
const UNKNOWN_INTERACTION = 10062;

/** A reply that lost a race, or whose token expired: nothing to report. */
export function isBenignReplyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code } = err as { code?: unknown };
  return (
    code === ALREADY_ACKNOWLEDGED ||
    code === UNKNOWN_INTERACTION ||
    code === "InteractionAlreadyReplied"
  );
}

type Reply = { content: string; flags?: number };

/** What the dispatcher touches of a repliable interaction (discord.js' real classes satisfy it). */
export interface RepliableInteraction {
  replied: boolean;
  deferred: boolean;
  locale?: string;
  customId?: string;
  isMessageComponent(): boolean;
  reply(options: Reply): Promise<unknown>;
  editReply(options: Reply): Promise<unknown>;
}

export interface DispatchLogger {
  error(object: Record<string, unknown>, message: string): void;
  warn(object: Record<string, unknown>, message: string): void;
  debug?(object: Record<string, unknown>, message: string): void;
}

export interface DispatchOptions {
  logger: DispatchLogger;
  /** How long a collector may take to acknowledge; overridable for tests. */
  graceMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** True when something else acknowledged the interaction within `graceMs`. */
async function acknowledgedElsewhere(
  interaction: RepliableInteraction,
  graceMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<boolean> {
  for (let waited = 0; waited < graceMs; waited += POLL_MS) {
    if (interaction.replied || interaction.deferred) return true;
    await sleep(POLL_MS);
  }
  return interaction.replied || interaction.deferred;
}

export async function executeInteractionSafely(
  client: { executeInteraction(interaction: never): unknown },
  interaction: BaseInteraction,
  { logger, graceMs = COLLECTOR_GRACE_MS, sleep = defaultSleep }: DispatchOptions,
): Promise<void> {
  let failed = false;
  try {
    await client.executeInteraction(interaction as never);
  } catch (err) {
    failed = true;
    logger.error({ err }, "[discord-kit] Interaction execution failed");
  }
  if (!interaction.isRepliable()) return;
  const target = interaction as unknown as RepliableInteraction;
  const lang = botLang(target.locale);
  try {
    if (target.replied) return;
    if (target.deferred) {
      if (failed) await target.editReply({ content: t(lang, "interaction.failed") });
      return;
    }
    if (
      !failed &&
      target.isMessageComponent() &&
      (await acknowledgedElsewhere(target, graceMs, sleep))
    ) {
      return;
    }
    const key = failed
      ? "interaction.failed"
      : PAGINATION_CUSTOM_ID.test(target.customId ?? "")
        ? "interaction.paginationExpired"
        : "interaction.unknown";
    await target.reply({ content: t(lang, key), flags: MessageFlags.Ephemeral });
  } catch (err) {
    if (isBenignReplyError(err)) {
      logger.debug?.(
        { err },
        "interaction fallback reply skipped: already acknowledged or expired",
      );
      return;
    }
    logger.warn({ err }, "[discord-kit] Failed to send interaction fallback reply");
  }
}
