import fr from "./locales/work.fr.json";
import en from "./locales/work.en.json";
import ja from "./locales/work.ja.json";

/** Labels of the work-page primitives (Carousel, CharacterCard, BroadcastSchedule). */
export type WorkMessages = typeof fr;
const dictionaries = { fr, en, ja } satisfies Record<string, WorkMessages>;
export function getWorkMessages(locale: string): WorkMessages {
  return dictionaries[locale as keyof typeof dictionaries] ?? fr;
}
export function workText(
  messages: WorkMessages,
  key: keyof WorkMessages,
  values: Record<string, string | number> = {},
): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    values[name] === undefined ? match : String(values[name]),
  );
}
