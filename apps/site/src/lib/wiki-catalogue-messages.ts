// SPDX-License-Identifier: Apache-2.0
import fr from "../../messages/wiki-catalogue/fr.json";
import en from "../../messages/wiki-catalogue/en.json";
import ja from "../../messages/wiki-catalogue/ja.json";

export type WikiCatalogueMessage = keyof typeof fr;
const dictionaries = { fr, en, ja };
export function wikiCatalogueMessages(locale: string) {
  const dictionary = dictionaries[locale as keyof typeof dictionaries] ?? fr;
  return (key: WikiCatalogueMessage, values?: Record<string, string | number>) =>
    dictionary[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      values && name in values ? String(values[name]) : whole,
    );
}
