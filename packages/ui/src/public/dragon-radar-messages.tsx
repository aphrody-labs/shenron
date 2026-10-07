// SPDX-License-Identifier: Apache-2.0
import fr from "./locales/dragon-radar.fr.json";
import en from "./locales/dragon-radar.en.json";
import ja from "./locales/dragon-radar.ja.json";

export type DragonRadarMessages = typeof fr;
const dictionaries = { fr, en, ja } satisfies Record<string, DragonRadarMessages>;
export function getDragonRadarMessages(locale: string): DragonRadarMessages {
  return dictionaries[locale as keyof typeof dictionaries] ?? fr;
}
export function radarText(
  messages: DragonRadarMessages,
  key: Exclude<keyof DragonRadarMessages, "suggestions">,
  values: Record<string, string | number> = {},
): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    values[name] === undefined ? match : String(values[name]),
  );
}
