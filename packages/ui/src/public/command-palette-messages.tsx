import fr from "./locales/command-palette.fr.json";
import en from "./locales/command-palette.en.json";
import ja from "./locales/command-palette.ja.json";

export type CommandPaletteMessages = typeof fr;
const dictionaries = { fr, en, ja } satisfies Record<string, CommandPaletteMessages>;
export function getCommandPaletteMessages(locale: string): CommandPaletteMessages {
  return dictionaries[locale as keyof typeof dictionaries] ?? fr;
}
export function paletteText(
  messages: CommandPaletteMessages,
  key: keyof CommandPaletteMessages,
  values: Record<string, string | number> = {},
): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    values[name] === undefined ? match : String(values[name]),
  );
}
