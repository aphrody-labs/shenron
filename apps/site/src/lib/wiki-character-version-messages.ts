import fr from "../../messages/wiki-public/fr.json";
import en from "../../messages/wiki-public/en.json";
import ja from "../../messages/wiki-public/ja.json";

export interface CharacterVersionMessages {
  intro: string;
  overview: string;
  chooseVersion: string;
  tabsLabel: string;
  form: string;
  age: string;
  years: string;
  affiliation: string;
  manga: string;
  animatedSeries: string;
  mangaPages: string;
  episodeSynopses: string;
  generatedImageCaption: string;
  imageReference: string;
  noImage: string;
  noSummary: string;
  powerAria: string;
  powerHeading: string;
  powerLevel: string;
  ki: string;
  maxKi: string;
  noPower: string;
  transformationsAria: string;
  transformations: string;
  noTransformations: string;
  techniquesAria: string;
  techniques: string;
  noTechniques: string;
  episodesNamed: string;
  volumesRange: string;
  volumeSingle: string;
  episodesRange: string;
  episodeSingle: string;
  officialReadings: string;
  scouterSource: string;
  daizenshuuSource: string;
  bpUnit: string;
  autoSynopsis: string;
  autoManga: string;
  autoBoth: string;
}

const dictionaries = {
  fr: fr.characterVersions,
  en: en.characterVersions,
  ja: ja.characterVersions,
} satisfies Record<"fr" | "en" | "ja", CharacterVersionMessages>;

/** Read the version-selector labels from the isolated public wiki namespace. */
export function getWikiCharacterVersionText(locale: string) {
  const messages = dictionaries[locale as keyof typeof dictionaries] ?? dictionaries.fr;
  return (key: keyof CharacterVersionMessages, values?: Record<string, string | number>) =>
    messages[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      values && name in values ? String(values[name]) : whole,
    );
}
