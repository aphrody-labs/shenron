import { tryT, type BotLang } from "~/lib/i18n";

/** `DRAGON_BALL` -> `Dragon ball`: readable stand-in for a code without a localized name. */
export function humanizeAchievementCode(code: string): string {
  const words = code
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return code;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Name shown to members for an achievement code: the localized name from the bot dictionaries
 * (`achievements.names.<CODE>`), else a humanized code. Never the raw `UPPER_SNAKE_CASE` code.
 */
export function achievementName(lang: BotLang, code: string): string {
  return tryT(lang, `achievements.names.${code}`) ?? humanizeAchievementCode(code);
}
