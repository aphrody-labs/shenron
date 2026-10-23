import { ButtonBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { logger } from "~/lib/logger";

/**
 * Emoji of buttons and select options, validated before they reach Discord.
 *
 * One invalid emoji rejects the WHOLE message (`Invalid Form Body
 * data.components[3].components[0].emoji.name[COMPONENT_INVALID_EMOJI]`), so the user sees an
 * error instead of the shop, the help or the pagination. The usual causes are a text arrow
 * (`←` is not an emoji), a unicode emoji missing its presentation selector, a custom emoji
 * passed as a bare name, `<:name:id>` unparsed, an empty or non-emoji string.
 */

export type ComponentEmoji = { id?: string; name?: string; animated?: boolean };

/** Text symbols commonly typed instead of the emoji Discord knows. */
const REPAIRS: Record<string, string> = {
  "←": "⬅️",
  "→": "➡️",
  "↑": "⬆️",
  "↓": "⬇️",
  "✓": "✔️",
  "✗": "✖️",
};

const SNOWFLAKE = /^\d{17,20}$/;
const CUSTOM_NAME = /^\w{2,32}$/;
/** `<:name:id>`, `<a:name:id>`, and the bracketless `name:id` / `a:name:id` discord.js also reads. */
const CUSTOM = /^(?:<(a?):|(a):)?(\w{2,32}):(\d{17,20})>?$/;
/** One emoji: flag, keycap, or a pictograph with its modifiers / ZWJ sequence / tag sequence. */
const UNICODE_EMOJI =
  /^(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic}|[\u{E0020}-\u{E007F}])*)$/u;
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function unicodeEmoji(raw: string): string | null {
  const text = REPAIRS[raw] ?? raw;
  if ([...segmenter.segment(text)].length !== 1 || !UNICODE_EMOJI.test(text)) return null;
  // Text-presentation pictographs (✏, ⚔, ⬅…) need U+FE0F to be the emoji Discord lists.
  const single = [...text].length === 1;
  return single && !/\p{Emoji_Presentation}/u.test(text) ? `${text}️` : text;
}

/**
 * The emoji in the shape Discord expects, repaired when the intent is obvious, or `null` when
 * the value cannot be an emoji (the button is then sent without one rather than failing).
 */
export function normalizeComponentEmoji(input: unknown): ComponentEmoji | null {
  if (typeof input === "string") {
    const text = input.trim();
    if (!text) return null;
    if (SNOWFLAKE.test(text)) return { id: text };
    const custom = CUSTOM.exec(text);
    if (custom)
      return { id: custom[4], name: custom[3], animated: (custom[1] ?? custom[2]) === "a" };
    const name = unicodeEmoji(text);
    return name ? { name } : null;
  }
  if (typeof input === "object" && input !== null) {
    const { id, name, animated } = input as Record<string, unknown>;
    if (id !== undefined && id !== null) {
      if (typeof id !== "string" || !SNOWFLAKE.test(id)) return null;
      const out: ComponentEmoji = { id };
      if (typeof name === "string" && CUSTOM_NAME.test(name)) out.name = name;
      if (animated === true) out.animated = true;
      return out;
    }
    if (typeof name !== "string") return null;
    const unicode = unicodeEmoji(name.trim());
    return unicode ? { name: unicode } : null;
  }
  return null;
}

type Settable = { setEmoji(emoji: unknown): unknown };

const GUARD = Symbol.for("shenron.componentEmojiGuard");
const warned = new Set<string>();

function guard(proto: Settable & { [GUARD]?: true }, label: string): boolean {
  if (proto[GUARD]) return false;
  const original = proto.setEmoji;
  proto.setEmoji = function guardedSetEmoji(this: unknown, emoji: unknown) {
    const normalized = normalizeComponentEmoji(emoji);
    if (!normalized) {
      const key = `${label}:${String(emoji)}`;
      if (!warned.has(key)) {
        warned.add(key);
        logger.warn({ builder: label, emoji: String(emoji) }, "[components] invalid emoji dropped");
      }
      return this;
    }
    return original.call(this, normalized);
  };
  proto[GUARD] = true;
  return true;
}

/**
 * Makes `ButtonBuilder#setEmoji` and `StringSelectMenuOptionBuilder#setEmoji` repair or drop an
 * invalid emoji instead of letting Discord reject the whole message (idempotent).
 */
export function installComponentEmojiGuard(): boolean {
  const button = guard(ButtonBuilder.prototype as unknown as Settable, "button");
  const option = guard(StringSelectMenuOptionBuilder.prototype as unknown as Settable, "option");
  return button || option;
}

/** Test hook: forgets which invalid values were already logged. */
export function resetComponentEmojiWarnings(): void {
  warned.clear();
}
