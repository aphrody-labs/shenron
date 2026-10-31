import type { CharacterBattle, CharacterVariant } from "@/lib/shenron";
import type { CharacterVersionMessages } from "@/lib/wiki-character-version-messages";

export const GOKU_PREVIEW_TIMELINES = [
  { slug: "goku-db", message: "gokuDb", isMain: true },
  { slug: "goku-dbz", message: "gokuDbz", isMain: false },
  { slug: "goku-dbs", message: "gokuDbs", isMain: false },
  { slug: "goku-gt", message: "gokuGt", isMain: false },
  { slug: "goku-xeno", message: "xenoGoku", isMain: false },
  { slug: "goku-cc", message: "gokuCc", isMain: false },
  { slug: "goku-4d", message: "goku4d", isMain: false },
  { slug: "goku-jumpforce", message: "gokuJumpForce", isMain: false },
  { slug: "goku-summary", message: "gokuSummary", isMain: false },
] as const;

type TimelineSlug = (typeof GOKU_PREVIEW_TIMELINES)[number]["slug"];

type PreviewSaga = {
  timeline: TimelineSlug;
  slug: string;
  sagaSlug: string;
  sagaNameKey: keyof CharacterVersionMessages;
  series: string | null;
  image: string;
  form: string;
  age: number;
  affiliation: string;
  transformations: string[];
  techniques: string[];
  storyKey: keyof CharacterVersionMessages;
  relations: string[];
};

const PREVIEW_SAGAS: PreviewSaga[] = [
  {
    timeline: "goku-db",
    slug: "goku-preview-main-pilaf",
    sagaSlug: "pilaf",
    sagaNameKey: "previewPilaf",
    series: "DB",
    image: "/dbz/characters/goku.webp",
    form: "Base",
    age: 12,
    affiliation: "École de la Tortue",
    transformations: [],
    techniques: ["Kamehameha"],
    storyKey: "previewPilafStory",
    relations: ["grand-pere-gohan", "krillin", "bulma", "tortue-geniale", "yamcha", "general-red"],
  },
  {
    timeline: "goku-db",
    slug: "goku-preview-main-piccolo-junior",
    sagaSlug: "piccolo-junior",
    sagaNameKey: "previewPiccoloJunior",
    series: "DB",
    image: "/dbz/characters/goku.webp",
    form: "Base",
    age: 18,
    affiliation: "École de la Tortue",
    transformations: [],
    techniques: ["Kamehameha", "Bukūjutsu"],
    storyKey: "previewPiccoloJuniorStory",
    relations: ["grand-pere-gohan", "krillin", "bulma", "tortue-geniale", "piccolo-daimao"],
  },
  {
    timeline: "goku-dbz",
    slug: "goku-preview-main-saiyan",
    sagaSlug: "saiyan",
    sagaNameKey: "previewSaiyan",
    series: "DBZ",
    image: "/dbz/characters/goku.webp",
    form: "Base · Kaioken",
    age: 24,
    affiliation: "Guerriers Z",
    transformations: [],
    techniques: ["Kamehameha", "Kaioken", "Genki Dama"],
    storyKey: "previewSaiyanStory",
    relations: ["baddack", "raditz", "krillin", "piccolo", "vegeta", "freezer"],
  },
  {
    timeline: "goku-dbz",
    slug: "goku-preview-main-majin-buu",
    sagaSlug: "majin-buu",
    sagaNameKey: "previewMajinBuu",
    series: "DBZ",
    image: "/dbz/transformations/goku-ssj3.webp",
    form: "Super Saiyan 3",
    age: 37,
    affiliation: "Guerriers Z",
    transformations: ["Super Saiyan", "Super Saiyan 2", "Super Saiyan 3"],
    techniques: ["Kamehameha", "Genki Dama", "Transmission instantanée"],
    storyKey: "previewMajinBuuStory",
    relations: ["chichi", "son-gohan", "son-goten", "krillin", "piccolo", "vegeta", "kid-buu"],
  },
  {
    timeline: "goku-dbs",
    slug: "goku-preview-main-battle-of-gods",
    sagaSlug: "battle-of-gods",
    sagaNameKey: "previewBattleOfGods",
    series: "DBS",
    image: "/dbz/characters/goku.webp",
    form: "Super Saiyan God",
    age: 42,
    affiliation: "Guerriers Z",
    transformations: ["Super Saiyan", "Super Saiyan God", "Super Saiyan Blue"],
    techniques: ["Kamehameha", "Genki Dama", "Transmission instantanée"],
    storyKey: "previewBattleOfGodsStory",
    relations: ["chichi", "son-gohan", "son-goten", "bulma", "vegeta", "piccolo", "freezer"],
  },
  {
    timeline: "goku-dbs",
    slug: "goku-preview-main-tournament-of-power",
    sagaSlug: "tournament-of-power",
    sagaNameKey: "previewTournamentOfPower",
    series: "DBS",
    image: "/dbz/transformations/goku-ultra-instinc.webp",
    form: "Ultra Instinct",
    age: 43,
    affiliation: "Univers 7",
    transformations: [
      "Super Saiyan",
      "Super Saiyan 2",
      "Super Saiyan 3",
      "Super Saiyan God",
      "Super Saiyan Blue",
      "Ultra Instinct",
    ],
    techniques: ["Kamehameha", "Genki Dama", "Transmission instantanée", "Kaioken"],
    storyKey: "previewTournamentOfPowerStory",
    relations: ["chichi", "son-gohan", "son-goten", "krillin", "vegeta", "freezer"],
  },
  {
    timeline: "goku-gt",
    slug: "goku-preview-main-baby",
    sagaSlug: "baby",
    sagaNameKey: "previewBaby",
    series: "DBGT",
    image: "/dbz/transformations/goku-ssj4.webp",
    form: "Super Saiyan 4",
    age: 52,
    affiliation: "Famille Son · Guerriers Z",
    transformations: ["Golden Great Ape", "Super Saiyan 4"],
    techniques: ["Kamehameha", "Genki Dama", "Transmission instantanée"],
    storyKey: "previewBabyStory",
    relations: ["chichi", "son-gohan", "son-goten", "pan", "vegeta", "piccolo"],
  },
  {
    timeline: "goku-gt",
    slug: "goku-preview-main-shadow-dragons",
    sagaSlug: "shadow-dragons",
    sagaNameKey: "previewShadowDragons",
    series: "DBGT",
    image: "/dbz/transformations/goku-ssj4.webp",
    form: "Super Saiyan 4",
    age: 53,
    affiliation: "Guerriers Z",
    transformations: ["Golden Great Ape", "Super Saiyan 4"],
    techniques: ["Kamehameha", "Genki Dama", "Transmission instantanée", "Dragon Fist"],
    storyKey: "previewShadowDragonsStory",
    relations: ["chichi", "son-gohan", "son-goten", "pan", "vegeta", "uub"],
  },
  ...(
    [
      [
        "goku-xeno",
        "xeno-arc-one",
        "previewTimelineArcOne",
        "/dbz/characters/goku.webp",
        "Base",
        2,
        4,
      ],
      [
        "goku-xeno",
        "xeno-arc-two",
        "previewTimelineArcTwo",
        "/dbz/transformations/goku-ssj3.webp",
        "Super Saiyan 3",
        4,
        5,
      ],
      [
        "goku-cc",
        "cc-arc-one",
        "previewTimelineArcOne",
        "/dbz/transformations/goku-ssjb.webp",
        "Super Saiyan Blue",
        5,
        4,
      ],
      [
        "goku-cc",
        "cc-arc-two",
        "previewTimelineArcTwo",
        "/dbz/transformations/goku-ultra-instinc.webp",
        "Ultra Instinct",
        6,
        5,
      ],
      [
        "goku-4d",
        "4d-arc-one",
        "previewTimelineArcOne",
        "/dbz/transformations/goku-ssj2.webp",
        "Super Saiyan 2",
        3,
        3,
      ],
      [
        "goku-4d",
        "4d-arc-two",
        "previewTimelineArcTwo",
        "/dbz/transformations/goku-ssj.webp",
        "Super Saiyan",
        4,
        4,
      ],
      [
        "goku-jumpforce",
        "jumpforce-arc-one",
        "previewTimelineArcOne",
        "/dbz/transformations/goku-ssj.webp",
        "Super Saiyan",
        3,
        3,
      ],
      [
        "goku-jumpforce",
        "jumpforce-arc-two",
        "previewTimelineArcTwo",
        "/dbz/transformations/goku-ssjb.webp",
        "Super Saiyan Blue",
        5,
        4,
      ],
    ] as const
  ).map(
    ([timeline, slug, sagaNameKey, image, form, transformations, techniques], index) =>
      ({
        timeline,
        slug: `goku-preview-${slug}`,
        sagaSlug: slug,
        sagaNameKey,
        series: null,
        image,
        form,
        age: 35 + index,
        affiliation: "Aperçu de timeline",
        transformations:
          transformations >= 6 ? ["Super Saiyan", "Ultra Instinct"] : ["Super Saiyan"],
        techniques: techniques >= 5 ? ["Kamehameha", "Genki Dama"] : ["Kamehameha"],
        storyKey: index % 2 === 0 ? "previewGameArcOneStory" : "previewGameArcTwoStory",
        relations:
          index % 2 === 0
            ? ["chichi", "vegeta", "piccolo", "freezer"]
            : ["son-gohan", "krillin", "vegeta", "kid-buu"],
      }) satisfies PreviewSaga,
  ),
];

export function getGokuPreviewTimelines(
  translate: (key: keyof CharacterVersionMessages) => string,
  mainCharacterName: string,
) {
  return GOKU_PREVIEW_TIMELINES.map((timeline, index) => ({
    id: -1 - index,
    name: timeline.isMain ? mainCharacterName : translate(timeline.message),
    label: translate(timeline.message),
    slug: timeline.slug,
    isMain: timeline.isMain,
  }));
}

export function resolveGokuPreviewTimeline(value: string | null | undefined): TimelineSlug {
  if (value === "goku-main") return "goku-db";
  return GOKU_PREVIEW_TIMELINES.find((timeline) => timeline.slug === value)?.slug ?? "goku-db";
}

function normalizeAbilityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function createGokuPreviewVariants(
  characterId: number,
  timeline: TimelineSlug,
  characterTransformations: Array<{ id: number; name: string }>,
  characterTechniques: Array<{ technique: { id: number; name: string } }>,
  translate: (
    key: keyof CharacterVersionMessages,
    values?: Record<string, string | number>,
  ) => string,
): CharacterVariant[] {
  if (timeline === "goku-summary") return [];
  const timelineName = translate(
    GOKU_PREVIEW_TIMELINES.find((choice) => choice.slug === timeline)!.message,
  );
  const findAbilityIds = <T extends { id: number; name: string }>(
    choices: T[],
    names: string[],
  ) => {
    const wanted = new Set(names.map(normalizeAbilityName));
    return choices.filter(({ name }) => wanted.has(normalizeAbilityName(name))).map(({ id }) => id);
  };
  return PREVIEW_SAGAS.filter((saga) => saga.timeline === timeline).map((saga, index) => {
    const sagaName = translate(saga.sagaNameKey);
    return {
      id:
        -500 - GOKU_PREVIEW_TIMELINES.findIndex((choice) => choice.slug === timeline) * 10 - index,
      slug: saga.slug,
      label: sagaName,
      displayName: null,
      nameJa: null,
      form: saga.form,
      image: saga.image,
      age: saga.age,
      powerLevel: null,
      ki: null,
      maxKi: null,
      role: null,
      affiliation: saga.affiliation,
      summary: translate("previewSagaSummary", { saga: sagaName, timeline: timelineName }),
      article: `## ${translate("previewHistoryHeading")}\n\n${translate(saga.storyKey, { saga: sagaName, timeline: timelineName })}`,
      highlights: null,
      firstVolume: null,
      lastVolume: null,
      firstEpisode: null,
      lastEpisode: null,
      keyEpisodes: null,
      episodeSeries: null,
      origin: "editorial",
      evidence: null,
      transformationIds: findAbilityIds(characterTransformations, saga.transformations),
      techniqueIds: findAbilityIds(
        characterTechniques.map(({ technique }) => technique),
        saga.techniques,
      ),
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
  if (!variantSlug) return null;
  return PREVIEW_SAGAS.find((saga) => saga.slug === variantSlug)?.relations ?? null;
}

const PREVIEW_BATTLES: Record<string, CharacterBattle[]> = {
  "goku-preview-main-pilaf": [
    {
      id: -101,
      slug: "goku-vs-pilaf",
      title: "Goku contre Pilaf",
      titleJa: null,
      series: "DB",
      winnerName: "Goku",
      climaxSummary: "Le premier affrontement de Goku face au gang de Pilaf.",
      location: "Montagne Fry-Pan",
    },
  ],
  "goku-preview-main-piccolo-junior": [
    {
      id: -102,
      slug: "goku-vs-piccolo-junior",
      title: "Goku contre Piccolo Jr.",
      titleJa: null,
      series: "DB",
      winnerName: "Goku",
      climaxSummary: "La finale du 23e Tenkaichi Budokai décide du sort de la Terre.",
      location: "Tenkaichi Budokai",
    },
  ],
  "goku-preview-main-saiyan": [
    {
      id: -103,
      slug: "goku-vs-raditz",
      title: "Goku et Piccolo contre Raditz",
      titleJa: null,
      series: "DBZ",
      winnerName: "Goku et Piccolo",
      climaxSummary: "Goku se sacrifie pour permettre à Piccolo de vaincre Raditz.",
      location: "Terre",
    },
    {
      id: -104,
      slug: "goku-vs-vegeta-saiyan",
      title: "Goku contre Vegeta",
      titleJa: null,
      series: "DBZ",
      winnerName: "Aucun",
      climaxSummary: "Le duel se poursuit après l'arrivée des alliés de Goku.",
      location: "Terre",
    },
  ],
  "goku-preview-main-majin-buu": [
    {
      id: -105,
      slug: "goku-vs-yakon",
      title: "Goku contre Yakon",
      titleJa: null,
      series: "DBZ",
      winnerName: "Goku",
      climaxSummary: "Goku révèle le Super Saiyan 2 face au monstre de Babidi.",
      location: "Vaisseau de Babidi",
    },
    {
      id: -106,
      slug: "goku-vs-majin-vegeta",
      title: "Goku contre Majin Vegeta",
      titleJa: null,
      series: "DBZ",
      winnerName: "Aucun",
      climaxSummary: "Le duel entre les deux rivaux reprend sous l'influence de Babidi.",
      location: "Terre",
    },
    {
      id: -107,
      slug: "goku-vs-kid-buu",
      title: "Goku contre Kid Buu",
      titleJa: null,
      series: "DBZ",
      winnerName: "Goku et ses alliés",
      climaxSummary: "Une Genki Dama conclut le combat contre Kid Buu.",
      location: "Planète des Kaiō",
    },
  ],
  "goku-preview-main-battle-of-gods": [
    {
      id: -108,
      slug: "goku-vs-beerus",
      title: "Goku contre Beerus",
      titleJa: null,
      series: "DBS",
      winnerName: "Beerus",
      climaxSummary: "Le Super Saiyan God affronte le dieu de la Destruction.",
      location: "Terre",
    },
  ],
  "goku-preview-main-tournament-of-power": [
    {
      id: -109,
      slug: "goku-vs-kefla",
      title: "Goku contre Kefla",
      titleJa: null,
      series: "DBS",
      winnerName: "Goku",
      climaxSummary: "Goku retrouve l'Ultra Instinct au cours du tournoi.",
      location: "Arène du tournoi",
    },
    {
      id: -110,
      slug: "goku-vs-jiren",
      title: "Goku et Freezer contre Jiren",
      titleJa: null,
      series: "DBS",
      winnerName: "Univers 7",
      climaxSummary: "Les derniers combattants de l'Univers 7 unissent leurs forces.",
      location: "Arène du tournoi",
    },
  ],
  "goku-preview-main-baby": [
    {
      id: -111,
      slug: "goku-vs-baby-vegeta",
      title: "Goku contre Baby Vegeta",
      titleJa: null,
      series: "DBGT",
      winnerName: "Goku",
      climaxSummary: "Goku revient sous la forme du Super Saiyan 4.",
      location: "Terre",
    },
  ],
  "goku-preview-main-shadow-dragons": [
    {
      id: -112,
      slug: "goku-vs-omega-shenron",
      title: "Goku et Vegeta contre Omega Shenron",
      titleJa: null,
      series: "DBGT",
      winnerName: "Goku",
      climaxSummary: "La dernière bataille de Dragon Ball GT oppose les Saiyans au dragon ultime.",
      location: "Terre",
    },
  ],
  "goku-preview-xeno-arc-one": [
    {
      id: -113,
      slug: "xeno-goku-vs-demon",
      title: "Xeno Goku contre un démon du temps",
      titleJa: null,
      series: "Heroes",
      winnerName: "Xeno Goku",
      climaxSummary: "Aperçu d'un affrontement de la timeline Dragon Ball Heroes.",
      location: "Faille temporelle",
    },
  ],
  "goku-preview-xeno-arc-two": [
    {
      id: -114,
      slug: "xeno-goku-ssj3-vs-demon",
      title: "Xeno Goku Super Saiyan 3 contre le démon",
      titleJa: null,
      series: "Heroes",
      winnerName: "Xeno Goku",
      climaxSummary: "La puissance de Xeno Goku évolue au cours de cet arc.",
      location: "Faille temporelle",
    },
  ],
  "goku-preview-cc-arc-one": [
    {
      id: -115,
      slug: "cc-goku-vs-enemy",
      title: "Goku CC contre un adversaire de la faille",
      titleJa: null,
      series: "Heroes",
      winnerName: "Goku CC",
      climaxSummary: "Aperçu d'un combat de la timeline du jeu Dragon Ball Heroes.",
      location: "Faille temporelle",
    },
  ],
  "goku-preview-cc-arc-two": [
    {
      id: -116,
      slug: "cc-goku-ultra-instinct-vs-enemy",
      title: "Goku CC Ultra Instinct contre son adversaire",
      titleJa: null,
      series: "Heroes",
      winnerName: "Goku CC",
      climaxSummary: "Le combat se poursuit avec l'Ultra Instinct.",
      location: "Faille temporelle",
    },
  ],
  "goku-preview-4d-arc-one": [
    {
      id: -117,
      slug: "goku-4d-vs-enemy-one",
      title: "Goku 4D contre son premier adversaire",
      titleJa: null,
      series: "Jeu vidéo",
      winnerName: "Goku",
      climaxSummary: "Aperçu d'un affrontement de cette version de Goku.",
      location: "Aventure",
    },
  ],
  "goku-preview-4d-arc-two": [
    {
      id: -118,
      slug: "goku-4d-vs-enemy-two",
      title: "Goku 4D contre son adversaire final",
      titleJa: null,
      series: "Jeu vidéo",
      winnerName: "Goku",
      climaxSummary: "Aperçu du combat final de cette aventure.",
      location: "Aventure",
    },
  ],
  "goku-preview-jumpforce-arc-one": [
    {
      id: -119,
      slug: "jump-force-goku-vs-enemy-one",
      title: "Goku contre un adversaire de Jump Force",
      titleJa: null,
      series: "Jump Force",
      winnerName: "Goku",
      climaxSummary: "Aperçu d'un affrontement de l'aventure Jump Force.",
      location: "Monde fusionné",
    },
  ],
  "goku-preview-jumpforce-arc-two": [
    {
      id: -120,
      slug: "jump-force-goku-vs-enemy-two",
      title: "Goku contre l'adversaire final de Jump Force",
      titleJa: null,
      series: "Jump Force",
      winnerName: "Goku",
      climaxSummary: "Aperçu du combat final de l'aventure Jump Force.",
      location: "Monde fusionné",
    },
  ],
};

export function getGokuPreviewBattles(variantSlug: string | null | undefined): CharacterBattle[] {
  if (variantSlug === "goku-summary") return Object.values(PREVIEW_BATTLES).flat();
  return variantSlug ? (PREVIEW_BATTLES[variantSlug] ?? []) : [];
}

export function getGokuPreviewSummaryArticle(
  translate: (
    key: keyof CharacterVersionMessages,
    values?: Record<string, string | number>,
  ) => string,
): string {
  const sections = GOKU_PREVIEW_TIMELINES.filter(
    (timeline) => timeline.slug !== "goku-summary",
  ).map((timeline) => {
    const sagas = PREVIEW_SAGAS.filter((saga) => saga.timeline === timeline.slug);
    const rows = sagas.map(
      (saga) =>
        `- **${translate(saga.sagaNameKey)}** — ${translate(saga.storyKey, {
          saga: translate(saga.sagaNameKey),
          timeline: translate(timeline.message),
        })}`,
    );
    return `### ${translate(timeline.message)}\n\n${rows.join("\n")}`;
  });
  return `## ${translate("sagaHistoryHeading")}\n\n${translate("summaryIntro")}\n\n${sections.join("\n\n")}`;
}
