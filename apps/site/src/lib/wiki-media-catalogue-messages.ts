// SPDX-License-Identifier: Apache-2.0
import fr from "../../messages/wiki-media-catalogue/fr.json";
import en from "../../messages/wiki-media-catalogue/en.json";
import ja from "../../messages/wiki-media-catalogue/ja.json";

export type WikiMediaMessage = keyof typeof fr;
const dictionaries = { fr, en, ja };
export function wikiMediaCatalogueMessages(locale: string) {
  const dictionary = dictionaries[locale as keyof typeof dictionaries] ?? fr;
  return (key: WikiMediaMessage, values?: Record<string, string | number>) =>
    dictionary[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      values && name in values ? String(values[name]) : whole,
    );
}
