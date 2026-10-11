// SPDX-License-Identifier: Apache-2.0
import { lexicon } from "@aphrody/shenron-lexicon/data";
import targets from "./dragon-radar-targets.json";

/** One lexicon supplies entity labels; missing entries keep their historical query. */
export function getRadarSuggestions(locale: string): string[] {
  const language = locale === "en" || locale === "ja" ? locale : "fr";
  const dictionary = lexicon();
  return targets.map(({ id, query }) => {
    const term = dictionary.get(id);
    return term ? dictionary.label(term, language).text : query;
  });
}
