// SPDX-License-Identifier: Apache-2.0
import fr from "../../messages/wiki-narrative/fr.json";
import en from "../../messages/wiki-narrative/en.json";
import ja from "../../messages/wiki-narrative/ja.json";
export type WikiNarrativeMessage = keyof typeof fr;
const dictionaries = { fr, en, ja };
export function wikiNarrativeMessages(locale: string) {
  const dictionary = dictionaries[locale as keyof typeof dictionaries] ?? fr;
  return (key: WikiNarrativeMessage, values?: Record<string, string | number>) =>
    dictionary[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      values && name in values ? String(values[name]) : whole,
    );
}
