import fr from "../../messages/wiki-public/fr.json";
import en from "../../messages/wiki-public/en.json";
import ja from "../../messages/wiki-public/ja.json";

export interface CharacterVersionMessages {
  intro: string;
  overview: string;
  chooseVersion: string;
  versionLabel: string;
  sagaLabel: string;
  mainTimeline: string;
  gokuDb?: string;
  gokuDbz?: string;
  gokuDbs?: string;
  gokuGt?: string;
  xenoGoku?: string;
  gokuCc?: string;
  goku4d?: string;
  gokuJumpForce?: string;
  chooseSaga: string;
  previewContentNotLinked?: string;
  previewPilaf?: string;
  previewPiccoloJunior?: string;
  previewSaiyan?: string;
  previewMajinBuu?: string;
  previewBattleOfGods?: string;
  previewTournamentOfPower?: string;
  previewBaby?: string;
  previewShadowDragons?: string;
  previewHistoryHeading?: string;
  previewSagaSummary?: string;
  previewSagaStory?: string;
  relationsTitle: string;
  relationsIntro: string;
  family: string;
  friends: string;
  enemies: string;
  emptyRelations: string;
  voiceActors: string;
  voiceLabel: string;
  frenchVoice: string;
  japaneseVoice: string;
  powersAndForms: string;
  anecdotes: string;
  tabsLabel: string;
  form: string;
  age: string;
  years: string;
  affiliation: string;
  manga: string;
  animatedSeries: string;
  mangaPages: string;
  episodeSynopses: string;
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

export type CharacterSagaMessages = Pick<
  CharacterVersionMessages,
  | "intro"
  | "overview"
  | "form"
  | "age"
  | "years"
  | "affiliation"
  | "manga"
  | "animatedSeries"
  | "mangaPages"
  | "episodeSynopses"
  | "imageReference"
  | "noImage"
  | "noSummary"
  | "powerAria"
  | "powerHeading"
  | "powerLevel"
  | "ki"
  | "maxKi"
  | "noPower"
  | "transformationsAria"
  | "transformations"
  | "noTransformations"
  | "techniquesAria"
  | "techniques"
  | "noTechniques"
  | "episodesNamed"
  | "volumesRange"
  | "volumeSingle"
  | "episodesRange"
  | "episodeSingle"
  | "autoSynopsis"
  | "autoManga"
  | "autoBoth"
>;

const dictionaries = {
  fr: fr.characterVersions,
  en: en.characterVersions,
  ja: ja.characterVersions,
} satisfies Record<"fr" | "en" | "ja", CharacterVersionMessages>;

/** Read the version-selector labels from the isolated public wiki namespace. */
export function getWikiCharacterVersionText(locale: string) {
  const messages = dictionaries[locale as keyof typeof dictionaries] ?? dictionaries.fr;
  return (key: keyof CharacterVersionMessages, values?: Record<string, string | number>) =>
    (messages[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) =>
      values && name in values ? String(values[name]) : whole,
    );
}
