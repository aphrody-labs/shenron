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
  gokuSummary: string;
  chooseSaga: string;
  previewContentNotLinked?: string;
  previewPilaf?: string;
  previewPiccoloJunior?: string;
  previewSaiyan?: string;
  previewFreezer?: string;
  previewCell?: string;
  previewMajinBuu?: string;
  previewBattleOfGods?: string;
  previewTournamentOfPower?: string;
  previewBaby?: string;
  previewShadowDragons?: string;
  previewTimelineArcOne?: string;
  previewTimelineArcTwo?: string;
  previewHistoryHeading?: string;
  sagaHistoryHeading?: string;
  sagaHistoryMissing?: string;
  summaryIntro: string;
  summarySagasHeading: string;
  loadingVersion: string;
  previewSagaSummary?: string;
  previewSagaStory?: string;
  previewPilafStory?: string;
  previewPiccoloJuniorStory?: string;
  previewSaiyanStory?: string;
  previewMajinBuuStory?: string;
  previewBuuStoryBeforeYakon?: string;
  previewBuuStoryAfterYakon?: string;
  previewBuuStoryAfterVegeta?: string;
  previewBuuStoryBeforeKidBuu?: string;
  previewBuuStoryAfterKidBuu?: string;
  previewBuuAnecdoteOneTitle?: string;
  previewBuuAnecdoteOne?: string;
  previewBuuAnecdoteTwoTitle?: string;
  previewBuuAnecdoteTwo?: string;
  previewBuuAnecdoteThreeTitle?: string;
  previewBuuAnecdoteThree?: string;
  previewBuuNameOriginTitle?: string;
  previewBuuNameOrigin?: string;
  previewNameOriginSource?: string;
  previewAnimationCredits?: string;
  previewCreditsScope?: string;
  previewCreditYakon?: string;
  previewCreditVegeta?: string;
  previewCreditBuu?: string;
  previewCreditGenkiDama?: string;
  previewEpisodeLabel?: string;
  previewAnimationSupervisor?: string;
  previewKeyAnimation?: string;
  previewCreditArtAlt?: string;
  previewOfficialEpisodeSource?: string;
  previewCreditsSource?: string;
  previewBuuDemoNotice?: string;
  previewBattleLocation?: string;
  previewBattleOutcome?: string;
  previewBattleImageAlt?: string;
  previewBattleOfGodsStory?: string;
  previewTournamentOfPowerStory?: string;
  previewBabyStory?: string;
  previewShadowDragonsStory?: string;
  previewGameArcOneStory?: string;
  previewGameArcTwoStory?: string;
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
  abilitiesIntro: string;
  officialData: string;
  anecdotes: string;
  additionalInformation: string;
  additionalInformationIntro: string;
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
  firstObtainedIn: string;
  appearance: string;
  sagaAppearance: string;
  techniquesAria: string;
  techniques: string;
  introducedThisSaga: string;
  knownFromEarlierSaga: string;
  noTechniques: string;
  techniqueUsesMissing: string;
  knownButUnusedTechniques: string;
  lastTechniqueUse: string;
  lastTechniqueUseMissing: string;
  techniqueSourceManga: string;
  techniqueSourceAnime: string;
  techniqueSourceMovie: string;
  techniqueSourceGame: string;
  techniqueSourceOther: string;
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
  | "sagaHistoryHeading"
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
  | "firstObtainedIn"
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
  | "powersAndForms"
  | "abilitiesIntro"
  | "introducedThisSaga"
  | "knownFromEarlierSaga"
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

export type WikiLocale = "fr" | "en" | "ja";
export type WikiPortalKey = keyof typeof fr.portal;
export type WikiReaderKey = keyof typeof fr.reader;

const portalDictionaries = {
  fr: fr.portal,
  en: en.portal,
  ja: ja.portal,
} as const;

const readerDictionaries = {
  fr: fr.reader,
  en: en.reader,
  ja: ja.reader,
} as const;

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export function getWikiPortalMessages(locale: string = "fr") {
  const dict = portalDictionaries[locale as WikiLocale] ?? portalDictionaries.fr;
  return (key: WikiPortalKey, values?: Record<string, string | number>) =>
    interpolate(dict[key], values);
}

export function getWikiReaderMessages(locale: string = "fr") {
  const dict = readerDictionaries[locale as WikiLocale] ?? readerDictionaries.fr;
  return (key: WikiReaderKey, values?: Record<string, string | number>) =>
    interpolate(dict[key], values);
}
