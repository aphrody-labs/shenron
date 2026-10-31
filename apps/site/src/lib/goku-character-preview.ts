import type { CharacterVariant } from "@/lib/shenron";
import type { CharacterVersionMessages } from "@/lib/wiki-character-version-messages";

const PREVIEW_SAGAS = [
  {
    series: "DB",
    slug: "goku-preview-db-pilaf",
    sagaSlug: "pilaf",
    sagaNameKey: "previewPilaf",
    image: "/dbz/characters/goku.webp",
  },
  {
    series: "DB",
    slug: "goku-preview-db-piccolo",
    sagaSlug: "piccolo-junior",
    sagaNameKey: "previewPiccoloJunior",
    image: "/dbz/transformations/goku-ssj.webp",
  },
  {
    series: "DBZ",
    slug: "goku-preview-dbz-saiyan",
    sagaSlug: "saiyan",
    sagaNameKey: "previewSaiyan",
    image: "/dbz/characters/goku.webp",
  },
  {
    series: "DBZ",
    slug: "goku-preview-dbz-majin-buu",
    sagaSlug: "majin-buu",
    sagaNameKey: "previewMajinBuu",
    image: "/dbz/transformations/goku-ssj3.webp",
  },
  {
    series: "DBS",
    slug: "goku-preview-dbs-gods",
    sagaSlug: "battle-of-gods",
    sagaNameKey: "previewBattleOfGods",
    image: "/dbz/transformations/goku-ssjb.webp",
  },
  {
    series: "DBS",
    slug: "goku-preview-dbs-tournament-of-power",
    sagaSlug: "tournament-of-power",
    sagaNameKey: "previewTournamentOfPower",
    image: "/dbz/transformations/goku-ultra-instinc.webp",
  },
  {
    series: "DBGT",
    slug: "goku-preview-gt-baby",
    sagaSlug: "baby",
    sagaNameKey: "previewBaby",
    image: "/dbz/transformations/goku-ssj4.webp",
  },
  {
    series: "DBGT",
    slug: "goku-preview-gt-shadow-dragons",
    sagaSlug: "shadow-dragons",
    sagaNameKey: "previewShadowDragons",
    image: "/dbz/transformations/goku-ssj4.webp",
  },
] as const;

const SERIES_ALIASES: Record<string, readonly string[]> = {
  DB: ["db", "dragonball"],
  DBZ: ["dbz", "dragonballz"],
  DBS: ["dbs", "dragonballsuper"],
  DBGT: ["dbgt", "gt", "dragonballgt"],
};

function normalizeSeries(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function filterGokuVariantsForSeries(
  variants: CharacterVariant[],
  series: string | null,
): CharacterVariant[] {
  if (!series) return variants;
  const aliases = SERIES_ALIASES[series];
  return aliases
    ? variants.filter((variant) => aliases.includes(normalizeSeries(variant.sagaSeries ?? "")))
    : [];
}

const RELATION_SLUGS: Record<string, string[]> = {
  "goku-preview-db-pilaf": [
    "grand-pere-gohan",
    "krillin",
    "bulma",
    "tortue-geniale",
    "yamcha",
    "general-red",
  ],
  "goku-preview-db-piccolo": [
    "grand-pere-gohan",
    "krillin",
    "bulma",
    "tortue-geniale",
    "piccolo-daimao",
  ],
  "goku-preview-dbz-saiyan": ["baddack", "raditz", "krillin", "piccolo", "vegeta", "freezer"],
  "goku-preview-dbz-majin-buu": [
    "chichi",
    "son-gohan",
    "son-goten",
    "krillin",
    "piccolo",
    "vegeta",
    "kid-buu",
  ],
  "goku-preview-dbs-gods": [
    "chichi",
    "son-gohan",
    "son-goten",
    "bulma",
    "vegeta",
    "piccolo",
    "freezer",
  ],
  "goku-preview-dbs-tournament-of-power": [
    "chichi",
    "son-gohan",
    "son-goten",
    "krillin",
    "vegeta",
    "freezer",
  ],
  "goku-preview-gt-baby": ["chichi", "son-gohan", "son-goten", "pan", "vegeta", "piccolo"],
  "goku-preview-gt-shadow-dragons": ["chichi", "son-gohan", "son-goten", "pan", "vegeta", "uub"],
};

export function createGokuPreviewVariants(
  characterId: number,
  translate: (
    key: keyof CharacterVersionMessages,
    values?: Record<string, string | number>,
  ) => string,
): CharacterVariant[] {
  return PREVIEW_SAGAS.map((saga, index) => {
    const sagaName = translate(saga.sagaNameKey);
    return {
      id: -500 - index,
      slug: saga.slug,
      label: sagaName,
      displayName: null,
      nameJa: null,
      form: null,
      image: saga.image,
      age: null,
      powerLevel: null,
      ki: null,
      maxKi: null,
      role: null,
      affiliation: null,
      summary: translate("previewSagaSummary", { saga: sagaName }),
      article: `## ${translate("previewHistoryHeading")}\n\n${translate("previewSagaStory", { saga: sagaName })}`,
      highlights: null,
      firstVolume: null,
      lastVolume: null,
      firstEpisode: null,
      lastEpisode: null,
      keyEpisodes: null,
      episodeSeries: saga.series,
      origin: null,
      evidence: null,
      transformationIds: null,
      techniqueIds: null,
      sagaId: -500 - index,
      sagaName,
      sagaSlug: saga.sagaSlug,
      sagaSeries: saga.series,
      sagaImage: null,
    };
  });
}

export function getGokuPreviewRelationSlugs(
  variantSlug: string | null | undefined,
): string[] | null {
  return variantSlug ? (RELATION_SLUGS[variantSlug] ?? null) : null;
}
