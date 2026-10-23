// SPDX-License-Identifier: Apache-2.0
/**
 * Compact one-line answers: success, error or information. A notice is a single Text Display
 * (no Container), meant to be sent ephemeral (the default of the reply helpers).
 */
import { t, type BotLang, type BotMessageKey } from "~/lib/i18n";
import { text } from "./blocks";
import { clip } from "./limits";

export type NoticeKind = "success" | "error" | "info";

export const NOTICE_ICONS: Record<NoticeKind, string> = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
};

const NOTICE_MAX = 1_000;

/** A notice from an already resolved text; line breaks collapse so it stays on one line. */
export function noticeText(kind: NoticeKind, message: string) {
  const oneLine = message.replace(/\s*\n\s*/g, " ").trim();
  return text(`${NOTICE_ICONS[kind]} ${clip(oneLine, NOTICE_MAX)}`);
}

/** A notice from a dictionary key (`{name}` placeholders filled from `vars`). */
export function notice(
  lang: BotLang,
  kind: NoticeKind,
  key: BotMessageKey,
  vars: Record<string, string | number> = {},
) {
  return noticeText(kind, t(lang, key, vars));
}
