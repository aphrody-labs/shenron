// SPDX-License-Identifier: Apache-2.0
/**
 * Discord limits that apply to a Components V2 message, in one place so the builders clip what
 * they can and `validate()` checks the rest.
 *
 * Sources: the components reference of the Discord developer documentation. The total length of
 * all Text Display contents of a message (`TEXT_TOTAL`) is not stated in the part of the
 * reference this project read; 4 000 characters is the value Discord enforces and the check is
 * kept conservative on purpose (an overflow is rejected here, with a path, instead of by
 * Discord with a generic 50035).
 */
export const LIMITS = {
  /** Components of a message, counted recursively (rows, buttons, containers, texts…). */
  components: 40,
  /** Sum of the `content` of every Text Display of a message. */
  textTotal: 4_000,
  /** Nesting: Container (1) → Section or Action Row (2) → Button, Select or Thumbnail (3). */
  depth: 3,
  customId: 100,
  buttonLabel: 80,
  url: 512,
  selectPlaceholder: 150,
  selectOptions: 25,
  optionLabel: 100,
  optionValue: 100,
  optionDescription: 100,
  buttonsPerRow: 5,
  gallery: 10,
  mediaDescription: 1_024,
  sectionTexts: 3,
  modalTitle: 45,
  modalLabel: 45,
} as const;

const ELLIPSIS = "…";

/**
 * `text` cut to `max` UTF-16 units with a trailing ellipsis. Never cuts a surrogate pair in two
 * (a lone surrogate makes Discord reject the whole message).
 */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = Math.max(0, max - ELLIPSIS.length);
  const last = text.charCodeAt(end - 1);
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end) + ELLIPSIS;
}
