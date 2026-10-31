import { hasEditorialDatabase } from "@/lib/prerender";
import { EntityParticipation } from "@/components/social/EntityParticipation";
import { TrackView } from "@/components/TrackView";
import { WikiArticle, WikiSources } from "@/components/wiki/WikiArticle";
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import { CategorizedAffiliates } from "@/components/wiki/CategorizedAffiliates";
import { getShenronCharacterRelations, type CharacterRelationItem } from "@/lib/shenron";
import { CharacterSagaVariants } from "@/components/wiki/CharacterSagaVariants";
import { CharacterPageSelectors } from "@/components/wiki/CharacterPageSelectors";
import { WikiSectionsReader, type ReaderPanel } from "@/components/wiki/WikiSectionsReader";
import { WikiImg } from "@/components/wiki/WikiImg";
import { CharacterPortraitWithTransformations } from "@/components/wiki/CharacterPortraitWithTransformations";
import { CharacterPowerScaling } from "@/components/wiki/CharacterPowerScaling";
import { DEFAULT_POWER_SCALING_CONFIG } from "@/lib/canon-engine";
import { ChevronDown, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { buildWikiContentPanels } from "@/lib/wiki-panels";
import { TECH_SECTION_KEYS, TRANSFO_SECTION_KEYS } from "@/lib/wiki-article-sections";
import {
  getShenronCharacter,
  getShenronCharacterCards,
  getShenronCharacterContinuities,
  getShenronCharacterIds,
  getShenronCharacterVariants,
  getShenronCharacterVariantBattles,
  getShenronCharacterVariantStaffCredits,
  getShenronCharacterVariantTechniqueUses,
  getShenronCharacterVariantVoiceActors,
  getShenronCharacterVariantAppearances,
  type CharacterWithRelations,
  type CharacterBattle,
  type CharacterVariantStaffCredit,
} from "@/lib/shenron";
import { assetUrl } from "@/lib/db-universe";
import type { Metadata } from "next";
import { ogMeta } from "@/lib/og";
import { notFound, permanentRedirect } from "next/navigation";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { GatedWrap } from "@/components/GatedLink";
import { cache, type ReactNode } from "react";
import type { Person, WithContext } from "schema-dts";
import type { SectionAccent } from "@/lib/wiki-section-accents";
import { capParams } from "@/lib/prerender";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { slugDeRace } from "@aphrody/shenron-config/races-alias";
import { pickBestImage } from "@/lib/image-variants";
import { getLocale } from "next-intl/server";
import { getWikiCharacterVersionText } from "@/lib/wiki-character-version-messages";
import { verifiedCharacterVariantImage } from "@/lib/wiki-image-evidence";
import {
  createGokuPreviewVariants,
  getGokuPreviewTimelines,
  getGokuPreviewRelationSlugs,
  getGokuPreviewBattles,
  getGokuPreviewSummaryArticle,
  resolveGokuPreviewTimeline,
} from "@/lib/goku-character-preview";
import { CHARACTER_CANONICAL_SLUGS, resolveCharacterParam } from "@/lib/wiki-slugs";

export const revalidate = 3600;

/** Fiches prérendues au build ; l'ISR sert toutes les autres à la demande. */
const PRERENDU = 100;

function PreviewBattleCard({
  battle,
  image,
  accent,
  imageAlt,
  outcomeLabel,
}: {
  battle: CharacterBattle;
  image: string;
  accent: string;
  imageAlt: string;
  outcomeLabel: string;
}) {
  return (
    <article className="dbz-panel relative isolate min-h-36 overflow-hidden border-dbz-red/25">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-2/5 sm:w-1/3">
        <WikiImg
          src={image}
          alt={imageAlt}
          className="h-full w-full object-cover object-top opacity-65"
          loading="lazy"
        />
        <div className={`absolute inset-0 bg-gradient-to-r ${accent} via-black/20 to-[#0b0b0b]`} />
      </div>
      <div className="relative z-10 flex min-h-36 flex-col justify-center py-4 pl-24 pr-4 sm:py-5 sm:pl-[28%] sm:pr-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-dbz-red sm:text-xs">
          {battle.series} <span className="px-1 text-white/30">·</span> {battle.location}
          <span className="px-1 text-white/30">·</span> {outcomeLabel}: {battle.winnerName}
        </p>
        <h3 className="mt-1 font-saiyan text-lg text-white sm:text-2xl">{battle.title}</h3>
        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-white/75 sm:text-sm sm:leading-6">
          {battle.climaxSummary}
        </p>
      </div>
    </article>
  );
}

function techniqueSourceHref(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const GOKU_RELATION_PREVIEW: Array<
  Omit<
    Pick<CharacterRelationItem, "category" | "relationType" | "name" | "nameJa" | "slug">,
    "slug"
  > & {
    slug: string;
  }
> = [
  ["family", "Père", "Bardock", "バーダック", "baddack"],
  ["family", "Mère", "Gine", "ギネ", "gine"],
  [
    "family",
    "Grand-père adoptif",
    "Grand-père Son Gohan",
    "孫悟飯（じいちゃん）",
    "grand-pere-gohan",
  ],
  ["family", "Frère aîné", "Raditz", "ラディッツ", "raditz"],
  ["family", "Épouse", "Chichi", "チチ", "chichi"],
  ["family", "Beau-père", "Gyumao (Roi Taureau)", "牛魔王", "gyumao"],
  ["family", "Fils aîné", "Son Gohan", "孫悟飯", "son-gohan"],
  ["family", "Fils cadet", "Son Goten", "孫悟天", "son-goten"],
  ["family", "Belle-fille", "Videl", "ビーデル", "videl"],
  ["family", "Petite-fille", "Pan", "パン", "pan"],
  ["friend", "Meilleur ami", "Krillin", "クリリン", "krillin"],
  ["friend", "Amie et alliée", "Bulma", "ブルマ", "bulma"],
  ["friend", "Maître", "Tortue Géniale", "武天老師", "tortue-geniale"],
  ["friend", "Allié", "Piccolo", "ピッコロ", "piccolo"],
  ["friend", "Rival et allié", "Vegeta", "ベジータ", "vegeta"],
  ["friend", "Compagnon", "Yamcha", "ヤムチャ", "yamcha"],
  ["friend", "Compagnon", "Tenshinhan", "天津飯", "tenshinhan"],
  ["friend", "Allié", "Chaozu", "餃子", "chaozu"],
  ["friend", "Disciple", "Uub", "ウーブ", "uub"],
  ["enemy", "Ennemi", "Kid Buu", "魔人ブウ（純粋）", "kid-buu"],
  ["enemy", "Ennemi", "Freezer", "フリーザ", "freezer"],
  ["enemy", "Ennemi", "Cell", "セル", "cell"],
  ["enemy", "Ennemi", "Piccolo Daimaô", "ピッコロ大魔王", "piccolo-daimao"],
  ["enemy", "Ennemi", "Général Red", "レッド総帥", "general-red"],
].map(([category, relationType, name, nameJa, slug]) => ({
  category: category as CharacterRelationItem["category"],
  relationType,
  name,
  nameJa,
  slug,
}));

function normalizeVersionLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bsaga\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

function isTransformedCharacterForm(value: string | null | undefined): boolean {
  const form = value
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  return Boolean(
    form &&
    /super saiyan|super guerrier|\bssj\b|ultra instinct|instinct superieur|great ape|ozaru|kaio.?ken|kaioken|golden great ape|forme bestiale/i.test(
      form,
    ),
  );
}

const TRANSFORMATION_NAMES_JA: Record<string, string> = {
  "super-saiyan": "超サイヤ人",
  "super-saiyan-2": "超サイヤ人2",
  "super-saiyan-3": "超サイヤ人3",
  "super-saiyan-4": "超サイヤ人4",
  "super-saiyan-god": "超サイヤ人ゴッド",
  "super-saiyan-blue": "超サイヤ人ブルー",
  "golden-great-ape": "黄金大猿",
  "great-ape": "大猿",
  ozaru: "大猿",
  kaioken: "界王拳",
  "ultra-instinct": "身勝手の極意",
  "ultra-instinct-sign": "身勝手の極意“兆”",
};

const TECHNIQUE_PREVIEW_IMAGES: Record<string, string> = {
  kamehameha: "/techniques/kamehameha.webp",
  "genki-dama": "/techniques/genkidama.webp",
  "teleportation-instantanee": "/techniques/teleportation.webp",
  kaioken: "/techniques/kaioken.webp",
};

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const ids = await getShenronCharacterIds(PRERENDU);
  return capParams(
    ids.map((id) => ({ slug: CHARACTER_CANONICAL_SLUGS[id] || String(id) })),
    PRERENDU,
  );
}

// Mémoïsé par requête : generateMetadata + le composant partagent un seul fetch.
const getChar = cache((idOrSlug: string | number) => getShenronCharacter(idOrSlug));

// Résumé texte brut pour <meta description> (markdown/HTML retirés, tronqué).
function plainText(md: string, max = 160): string {
  const t = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[#*_`>~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveCharacterParam(slug);
  const c = await getChar(resolved.canonicalSlug ?? resolved.id ?? slug);
  if (!c) notFound();
  const heroImage = pickBestImage([c.image, c.portraitXv2]) ?? c.image;
  const img = heroImage ? assetUrl(heroImage) : undefined;
  const description = c.description
    ? plainText(c.description)
    : `${c.name} — fiche personnage Dragon Ball : race, techniques, transformations et lore sur DBFR.`;
  const pageTitle = c.nameJa
    ? `${c.name} (${c.nameJa}) — Personnage Dragon Ball`
    : `${c.name} — Personnage Dragon Ball`;
  return {
    title: pageTitle,
    description,
    ...ogMeta({
      title: `${c.name} — DBFR`,
      description,
      image: img ?? null,
      canonical: `/wiki/characters/${c.slug}`,
    }),
  };
}

export default async function CharacterPage({
  params,
  searchParams,
  preview = false,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    saga?: string | string[];
    timeline?: string | string[];
    demoAppearances?: string | string[];
  }>;
  preview?: boolean;
}) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve(
        {} as {
          saga?: string | string[];
          timeline?: string | string[];
          demoAppearances?: string | string[];
        },
      ),
  ]);
  const resolved = resolveCharacterParam(slug);
  const localGokuPreview: CharacterWithRelations = {
    id: -9900,
    slug: "son-goku",
    name: "Son Goku",
    nameJa: "孫悟空",
    nameRomaji: "Son Gokuu",
    image: "/dbz/characters/goku.webp",
    portraitXv2: null,
    ki: null,
    maxKi: null,
    race: "Saiyan",
    gender: "Male",
    affiliation: "Guerriers Z",
    description: "Aperçu local de la fiche de Son Goku.",
    article: null,
    articleSources: null,
    originPlanetId: null,
    stats: null,
    debutEpisodeId: null,
    debutChapterId: null,
    debutSagaId: null,
    transformations: [
      {
        id: -9301,
        slug: "super-saiyan",
        name: "Super Saiyan",
        nameJa: "超サイヤ人",
        image: "/dbz/transformations/goku-ssj.webp",
        ki: null,
        characterId: -9900,
      },
      {
        id: -9302,
        slug: "super-saiyan-2",
        name: "Super Saiyan 2",
        nameJa: "超サイヤ人2",
        image: "/dbz/transformations/goku-ssj2.webp",
        ki: null,
        characterId: -9900,
      },
      {
        id: -9303,
        slug: "super-saiyan-3",
        name: "Super Saiyan 3",
        nameJa: "超サイヤ人3",
        image: "/dbz/transformations/goku-ssj3.webp",
        ki: null,
        characterId: -9900,
      },
    ],
    originPlanet: null,
    techniques: [
      {
        technique: {
          id: -9401,
          slug: "kamehameha",
          name: "Kamehameha",
          nameJa: null,
          nameRomaji: null,
          description: null,
          type: "Ki",
          creatorId: null,
          creatorSlug: null,
          creatorName: "Tortue Géniale",
          creatorImage: null,
          image: "/techniques/kamehameha.webp",
          article: null,
          articleSources: null,
        },
      },
      {
        technique: {
          id: -9402,
          slug: "genki-dama",
          name: "Genki Dama",
          nameJa: null,
          nameRomaji: null,
          description: null,
          type: "Ki",
          creatorId: null,
          creatorSlug: null,
          creatorName: null,
          creatorImage: null,
          image: "/techniques/genkidama.webp",
          article: null,
          articleSources: null,
        },
      },
      {
        technique: {
          id: -9403,
          slug: "teleportation-instantanee",
          name: "Transmission instantanée",
          nameJa: null,
          nameRomaji: null,
          description: null,
          type: "Déplacement",
          creatorId: null,
          creatorSlug: null,
          creatorName: null,
          creatorImage: null,
          image: "/techniques/teleportation.webp",
          article: null,
          articleSources: null,
        },
      },
      {
        technique: {
          id: -9404,
          slug: "kaioken",
          name: "Kaioken",
          nameJa: null,
          nameRomaji: null,
          description: null,
          type: "Amplification",
          creatorId: null,
          creatorSlug: null,
          creatorName: "Kaïô du Nord",
          creatorImage: null,
          image: "/techniques/kaioken.webp",
          article: null,
          articleSources: null,
        },
      },
    ],
    versions: [],
    affiliates: [],
    battles: [],
    voiceActors: [
      {
        id: -9201,
        slug: "masako-nozawa",
        name: "Masako Nozawa",
        nameJa: "野沢 雅子",
        nationality: "ja",
        roleNotes: "Voix japonaise de Goku.",
        image:
          "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/%E9%87%8E%E6%B2%A2%E9%9B%85%E5%AD%90.png/330px-%E9%87%8E%E6%B2%A2%E9%9B%85%E5%AD%90.png",
      },
      {
        id: -9202,
        slug: "patrick-borg",
        name: "Patrick Borg",
        nameJa: null,
        nationality: "fr",
        roleNotes: "Voix française principale de Goku dans Dragon Ball Z.",
        image:
          "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Patrick_Borg_%2852747511372%29.jpg/330px-Patrick_Borg_%2852747511372%29.jpg",
      },
    ],
  };
  const character =
    preview && process.env.NODE_ENV === "development" && slug === "son-goku"
      ? localGokuPreview
      : await getChar(resolved.canonicalSlug ?? resolved.id ?? slug);

  if (!character) notFound();
  // Redirection permanente 301 post-migration : si l'URL est numérique ou un alias,
  // redirection vers le slug mondial officiel canonique.
  if (resolved.isLegacyNumericId || resolved.isAlias || slug !== character.slug) {
    permanentRedirect(`/wiki/characters/${character.slug}`);
  }

  // Versions saga par saga (bot.db_character_variants) — chargées après la
  // fiche parce qu'elles en dépendent, et lues même quand la liste est vide :
  // une requête indexée sur (character_id, sort_order) coûte moins qu'un
  // aller-retour conditionnel de plus dans le rendu.
  // `access` : la frise est un composant client et ne peut pas lire la
  // configuration de lancement ; on la résout ici et on la lui passe.
  const [
    loadedVariants,
    access,
    previewCharacterCards,
    continuities,
    techniqueUses,
    variantAppearances,
    variantStaffCredits,
    variantVoiceActors,
  ] = await Promise.all([
    preview ? Promise.resolve([]) : getShenronCharacterVariants(character.id),
    getLaunchConfig().catch(() => null),
    preview ? getShenronCharacterCards().catch(() => []) : Promise.resolve([]),
    preview ? Promise.resolve([]) : getShenronCharacterContinuities(character.id),
    preview ? Promise.resolve([]) : getShenronCharacterVariantTechniqueUses(character.id),
    preview ? Promise.resolve([]) : getShenronCharacterVariantAppearances(character.id),
    preview ? Promise.resolve([]) : getShenronCharacterVariantStaffCredits(character.id),
    preview ? Promise.resolve([]) : getShenronCharacterVariantVoiceActors(character.id),
  ]);
  const locale = await getLocale();
  const versionT = getWikiCharacterVersionText(locale);
  const isGokuMainCharacter = normalizeVersionLabel(character.name) === "songoku";
  const requestedTimeline = Array.isArray(query.timeline) ? query.timeline[0] : query.timeline;
  const previewTimeline = resolveGokuPreviewTimeline(requestedTimeline);
  const previewChoices = isGokuMainCharacter
    ? getGokuPreviewTimelines(versionT, character.name)
    : [];
  const liveTimelineChoices =
    continuities.length > 0
      ? continuities.map(({ id, name, slug, label, isMain }) => ({
          id,
          name,
          slug,
          label,
          isMain,
        }))
      : character.versions.map(({ id, name, slug }) => ({ id, name, slug }));
  const versionChoices = isGokuMainCharacter
    ? [
        ...liveTimelineChoices,
        {
          id: -9000,
          name: versionT("gokuSummary"),
          label: versionT("gokuSummary"),
          slug: "goku-summary",
          isMain: false,
        },
      ]
    : liveTimelineChoices;
  const isSummaryVersion =
    isGokuMainCharacter &&
    (preview ? previewTimeline === "goku-summary" : requestedTimeline === "goku-summary");
  const variants =
    preview && isGokuMainCharacter
      ? createGokuPreviewVariants(
          character.id,
          previewTimeline,
          character.transformations.map(({ id, name }) => ({ id, name })),
          character.techniques.map(({ technique: { id, name } }) => ({ technique: { id, name } })),
          versionT,
        )
      : loadedVariants;
  const sagaVariants = isSummaryVersion ? [] : variants;
  const requestedSaga = Array.isArray(query.saga) ? query.saga[0] : query.saga;
  const activeVariant =
    sagaVariants.find((variant) => variant.slug === requestedSaga) ?? sagaVariants[0] ?? null;
  const activeVariantStaffCredits = variantStaffCredits.filter(
    (credit) => credit.variantId === activeVariant?.id,
  );
  const activeVariantVoiceActors = variantVoiceActors.filter(
    (actor) => actor.variantId === activeVariant?.id,
  );
  const pageVoiceActors = activeVariantVoiceActors.length
    ? activeVariantVoiceActors.map((actor) => ({
        id: actor.id,
        slug: actor.slug,
        name: actor.name,
        nameJa: actor.nameJa,
        nationality: actor.nationality,
        roleNotes: actor.roleNotes,
        image: actor.image,
      }))
    : character.voiceActors;
  const activePortraitAppearances = variantAppearances.filter(
    (appearance) => appearance.variantId === activeVariant?.id,
  );
  const demoAppearances = Array.isArray(query.demoAppearances)
    ? query.demoAppearances[0]
    : query.demoAppearances;
  if (
    preview &&
    process.env.NODE_ENV === "development" &&
    demoAppearances === "1" &&
    activeVariant
  ) {
    activePortraitAppearances.push(
      {
        id: -9001,
        variantId: activeVariant.id,
        transformationId: null,
        transformationName: "Super Saiyan",
        image: "/dbz/transformations/goku-ssj.webp",
        altText: "Son Goku en Super Saiyan",
        sourceUrl: null,
        sortOrder: 1,
      },
      {
        id: -9002,
        variantId: activeVariant.id,
        transformationId: null,
        transformationName: "Super Saiyan 2",
        image: "/dbz/transformations/goku-ssj2.webp",
        altText: "Son Goku en Super Saiyan 2",
        sourceUrl: null,
        sortOrder: 2,
      },
    );
  }
  const activeVariantIndex = activeVariant
    ? Math.max(
        0,
        sagaVariants.findIndex((variant) => variant.id === activeVariant.id),
      )
    : -1;
  const earlierVariantIds = new Set(sagaVariants.slice(0, activeVariantIndex).map(({ id }) => id));
  const savedCurrentTechniqueUses = techniqueUses
    .filter((use) => use.variantId === activeVariant?.id)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const currentTechniqueUses =
    preview &&
    process.env.NODE_ENV === "development" &&
    activeVariant &&
    savedCurrentTechniqueUses.length === 0
      ? (activeVariant.techniqueIds ?? []).slice(0, 3).map((techniqueId, index) => ({
          id: -9200 - index,
          variantId: activeVariant.id,
          techniqueId,
          sourceType: index === 1 ? "manga" : "anime",
          sourceLabel: `DBZ · #${index === 1 ? 507 : 280 + index * 3}`,
          sourceUrl: null,
          note: null,
          sortOrder: index + 1,
          sagaName: activeVariant.sagaName,
          sagaSeries: activeVariant.sagaSeries,
          variantSlug: activeVariant.slug,
        }))
      : savedCurrentTechniqueUses;
  const currentTechniqueIds = new Set([
    ...(activeVariant?.techniqueIds ?? []),
    ...currentTechniqueUses.map(({ techniqueId }) => techniqueId),
  ]);
  const earlierTechniqueIds = new Set(
    sagaVariants.slice(0, activeVariantIndex).flatMap((variant) => variant.techniqueIds ?? []),
  );
  const variantPositions = new Map(sagaVariants.map((variant, index) => [variant.id, index]));
  const earlierTechniqueUses = techniqueUses
    .filter((use) => earlierVariantIds.has(use.variantId))
    .sort(
      (a, b) =>
        (variantPositions.get(a.variantId) ?? -1) - (variantPositions.get(b.variantId) ?? -1) ||
        a.sortOrder - b.sortOrder ||
        a.id - b.id,
    );
  const lastUseByTechnique = new Map<number, (typeof earlierTechniqueUses)[number]>();
  for (const use of earlierTechniqueUses) lastUseByTechnique.set(use.techniqueId, use);
  const techniquesInArc = character.techniques
    .filter(({ technique }) => currentTechniqueIds.has(technique.id))
    .sort(
      (a, b) =>
        currentTechniqueUses.filter((use) => use.techniqueId === b.technique.id).length -
        currentTechniqueUses.filter((use) => use.techniqueId === a.technique.id).length,
    );
  const knownButUnusedTechniques = character.techniques.filter(
    ({ technique }) =>
      earlierTechniqueIds.has(technique.id) && !currentTechniqueIds.has(technique.id),
  );
  const summaryTimelines =
    isSummaryVersion && !preview
      ? await Promise.all(
          continuities.map(async (continuity) => ({
            ...continuity,
            sagas: await getShenronCharacterVariants(continuity.id),
          })),
        )
      : [];
  const summaryArticle = isSummaryVersion
    ? preview
      ? getGokuPreviewSummaryArticle(versionT)
      : [
          `## ${versionT("sagaHistoryHeading")}`,
          versionT("summaryIntro"),
          ...summaryTimelines.map((timeline) => {
            const heading = `### ${timeline.label || timeline.name}`;
            const description = timeline.description?.trim() ?? "";
            const sagaRows = timeline.sagas.map((saga) => {
              const url = `/wiki/characters/${timeline.slug}?saga=${encodeURIComponent(saga.slug)}`;
              const title = `${saga.sagaSeries ? `${saga.sagaSeries} · ` : ""}${saga.sagaName}`;
              return `- [${title}](${url})${saga.summary ? ` — ${saga.summary.replace(/\s+/g, " ").trim()}` : ""}`;
            });
            return [heading, description, `#### ${versionT("summarySagasHeading")}`, ...sagaRows]
              .filter(Boolean)
              .join("\n\n");
          }),
        ].join("\n\n")
    : null;
  const variantBattles =
    isSummaryVersion && preview
      ? getGokuPreviewBattles("goku-summary")
      : activeVariant
        ? preview
          ? getGokuPreviewBattles(activeVariant.slug)
          : await getShenronCharacterVariantBattles(activeVariant.id)
        : (character.battles ?? []);
  const activeSagaVariants = activeVariant ? [activeVariant] : [];
  const relationRows = preview
    ? []
    : await getShenronCharacterRelations(character.id, activeVariant?.id);
  const relations =
    activeVariant && relationRows.some((relation) => relation.variantId === activeVariant.id)
      ? relationRows.filter((relation) => relation.variantId === activeVariant.id)
      : relationRows.filter((relation) => relation.variantId === null);
  // Use a saga portrait only when its editorial evidence explicitly covers the
  // image field; otherwise keep the character's approved portrait as fallback.
  const sagaImage = activeVariant
    ? preview
      ? activeVariant.image
      : verifiedCharacterVariantImage(activeVariant.image, activeVariant.evidence)
    : null;
  const transformedSagaImage =
    activeVariant && isTransformedCharacterForm(activeVariant.form) ? sagaImage : null;
  if (
    activeVariant?.form &&
    transformedSagaImage &&
    !activePortraitAppearances.some((appearance) => appearance.image === transformedSagaImage)
  ) {
    activePortraitAppearances.unshift({
      id: -9100,
      variantId: activeVariant.id,
      transformationId: null,
      transformationName: activeVariant.form,
      image: transformedSagaImage,
      altText: `${activeVariant.displayName ?? character.name} — ${activeVariant.form}`,
      sourceUrl: null,
      sortOrder: 0,
    });
  }
  const heroImage =
    (activeVariant && !isTransformedCharacterForm(activeVariant.form) ? sagaImage : null) ??
    character.image ??
    character.portraitXv2;
  const pageCharacterName = isSummaryVersion ? versionT("gokuSummary") : character.name;
  const pageCharacterNameJa = activeVariant?.nameJa ?? character.nameJa;
  const pageAffiliation = activeVariant ? activeVariant.affiliation : character.affiliation;

  const personSchema: WithContext<Person> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: pageCharacterName,
    image: heroImage ? assetUrl(heroImage) : undefined,
    description: activeVariant?.summary
      ? plainText(activeVariant.summary)
      : character.description
        ? plainText(character.description)
        : undefined,
    alternateName: pageCharacterNameJa ?? undefined,
    homeLocation: character.originPlanet
      ? {
          "@type": "Place",
          name: character.originPlanet.name,
        }
      : undefined,
  };

  // ── Catégories de la fiche ────────────────────────────────────────────────
  // Contenu = article long-format éclaté par titre `##` (Histoire, Personnalité,
  // Pouvoirs et techniques, Transformations, Anecdotes…) + surcharges/ajouts
  // éditoriaux du studio (db_wiki_sections, ex. PWS). Zéro fabrication : on ne
  // fait que structurer du contenu déjà présent, tout rendu côté serveur.
  const contentPanels = await buildWikiContentPanels({
    entityType: "character",
    entityId: character.id,
    article: isSummaryVersion
      ? (summaryArticle ?? character.article)
      : activeVariant
        ? activeVariant.article?.trim() ||
          `## ${versionT("sagaHistoryHeading")}\n\n${versionT("sagaHistoryMissing")}`
        : character.article,
    description: isSummaryVersion
      ? null
      : activeVariant
        ? activeVariant.summary
        : character.description,
    preferArticle: isSummaryVersion || Boolean(activeVariant),
    articleTarget:
      !isSummaryVersion && activeVariant
        ? { table: "db_character_variants", rowId: activeVariant.id }
        : undefined,
  });

  // Galeries relationnelles (vignettes de transformations, fiches techniques).
  // `withHeading=false` quand on les fusionne dans une catégorie de l'article
  // qui porte déjà son titre (évite un double bandeau).
  const transformationCards = (transformations: typeof character.transformations, key?: string) => (
    <div
      key={key}
      className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3"
      aria-label={versionT("transformations")}
    >
      {transformations.map((transfo, index) => {
        const firstSaga = sagaVariants.find((variant) =>
          variant.transformationIds?.includes(transfo.id),
        );
        const japaneseName = TRANSFORMATION_NAMES_JA[transfo.slug] ?? transfo.name;
        return (
          <article
            key={transfo.id}
            className="group relative isolate flex min-w-0 gap-3 overflow-hidden rounded-2xl border border-dbz-purple/25 bg-gradient-to-br from-dbz-purple/[0.12] via-dbz-card/80 to-black/35 p-3 transition-colors hover:border-dbz-purple/60 sm:gap-4 sm:p-4"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-12 -z-10 size-36 rounded-full bg-dbz-purple/10 blur-3xl transition-colors group-hover:bg-dbz-purple/20"
            />
            <div className="relative aspect-[3/4] w-[5.25rem] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/35 sm:w-24">
              <div aria-hidden="true" className="absolute inset-0 halftone opacity-10" />
              <WikiImg
                src={transfo.image}
                alt={transfo.name}
                loading="lazy"
                className="object-contain p-1 transition-transform duration-500 group-hover:scale-105"
                placeholderClassName="absolute inset-0 flex items-center justify-center rounded-xl"
              />
              <span className="absolute left-1.5 top-1.5 rounded-md border border-white/10 bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white/65">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1">
              <h3
                lang="ja"
                className="break-words font-display text-lg font-bold leading-snug text-white transition-colors group-hover:text-dbz-purple sm:text-xl"
              >
                {japaneseName}
              </h3>
              <p className="text-xs font-medium text-white/55">{transfo.name}</p>
              {firstSaga && (
                <p className="text-[10px] leading-relaxed text-white/45">
                  {versionT("firstObtainedIn", { saga: firstSaga.sagaName })}
                </p>
              )}
              {transfo.ki && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dbz-purple/25 bg-black/25 px-2.5 py-1 font-mono text-[11px] text-white/70">
                  <span className="size-1.5 rounded-full bg-dbz-purple" aria-hidden="true" />
                  KI · {transfo.ki}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  const transfoGrid = (withHeading: boolean): ReactNode => (
    <section className="space-y-8">
      {withHeading && (
        <div className="flex items-center gap-6">
          <h2 className="font-saiyan text-2xl sm:text-4xl md:text-5xl text-dbz-orange uppercase tracking-widest">
            TRANSFORMATIONS
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-dbz-orange/50 to-transparent" />
        </div>
      )}
      {transformationCards(character.transformations)}
    </section>
  );

  const techGrid = (withHeading: boolean): ReactNode => (
    <section className="space-y-8">
      {withHeading && (
        <div className="flex items-center gap-6">
          <h2 className="font-saiyan text-2xl sm:text-4xl md:text-5xl text-dbz-blue-light uppercase tracking-widest">
            TECHNIQUES & CAPACITÉS
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-dbz-blue-light/50 to-transparent" />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {character.techniques.map(({ technique: tech }) => (
          <div
            key={tech.id}
            className="dbz-panel p-6 hover:border-dbz-blue-light transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-white group-hover:text-dbz-blue-light transition-colors uppercase tracking-wider">
                {tech.name}
              </h3>
              <span className="scouter-text text-[10px] text-dbz-blue-light/60">
                TECH_ID: {tech.id}
              </span>
            </div>
            {tech.description && (
              <p className="text-sm text-gray-400 leading-relaxed line-clamp-3 font-sans">
                {tech.description}
              </p>
            )}
            <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
              <GatedWrap
                href={`/wiki/techniques/${tech.slug}`}
                className="text-[10px] font-bold text-dbz-blue-light hover:text-white uppercase tracking-widest transition-colors"
              >
                Détails Technique →
              </GatedWrap>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  // Assemble les pilules : catégories de contenu, puis fusion/ajout des galeries
  // relationnelles, puis Versions et Personnages affiliés.
  const relationCardBySlug = new Map(previewCharacterCards.map((card) => [card.slug, card]));
  const previewRelationSlugs = getGokuPreviewRelationSlugs(activeVariant?.slug);
  const previewRelations = previewRelationSlugs
    ? GOKU_RELATION_PREVIEW.filter((item) => previewRelationSlugs.includes(item.slug))
    : GOKU_RELATION_PREVIEW;
  const relationItems: CharacterRelationItem[] = preview
    ? previewRelations.map((item, index) => {
        const card = relationCardBySlug.get(item.slug);
        return {
          id: -100 - index,
          characterId: character.id,
          variantId: null,
          relatedCharacterId: card?.id ?? null,
          category: item.category,
          relationType: item.relationType,
          name: item.name,
          nameJa: item.nameJa,
          image: card?.image ?? null,
          slug: item.slug,
          description: null,
          sortOrder: index,
        };
      })
    : relations.length > 0
      ? relations
      : character.affiliates.map((item, index) => ({
          id: item.id,
          characterId: character.id,
          variantId: null,
          relatedCharacterId: item.id,
          category: "friend" as const,
          relationType: null,
          name: item.name,
          nameJa: null,
          image: item.image,
          slug: item.slug,
          description: null,
          sortOrder: index,
        }));
  const familyContent = contentPanels.find((panel) => panel.key === "famille")?.node;

  const panels: ReaderPanel[] = contentPanels
    .filter((panel) => {
      if (relationItems.length > 0 && panel.key === "famille") return false;
      if (
        sagaVariants.length > 0 &&
        (TRANSFO_SECTION_KEYS.has(panel.key) || TECH_SECTION_KEYS.has(panel.key))
      )
        return false;
      return true;
    })
    .map((panel) => {
      const key = panel.key.toLowerCase();
      if (
        preview &&
        activeVariant?.slug === "goku-preview-main-majin-buu" &&
        key.includes("histoire")
      ) {
        const battleArtwork = [
          {
            battle: variantBattles[0],
            image: "/dbz/characters/babidi.webp",
            accent: "from-amber-950/90",
          },
          {
            battle: variantBattles[1],
            image: "/dbz/transformations/vegeta-ssj2.webp",
            accent: "from-red-950/90",
          },
          {
            battle: variantBattles[2],
            image: "/dbz/transformations/majin-buu-pure.webp",
            accent: "from-fuchsia-950/90",
          },
        ].filter(
          (
            item,
          ): item is { battle: (typeof variantBattles)[number]; image: string; accent: string } =>
            Boolean(item.battle),
        );
        return {
          ...panel,
          node: (
            <div className="space-y-7">
              <p className="rounded-xl border border-dbz-orange/25 bg-dbz-orange/5 px-4 py-3 text-sm leading-relaxed text-white/65">
                {versionT("previewBuuDemoNotice")}
              </p>
              <WikiMarkdown body={versionT("previewBuuStoryBeforeYakon")} />
              {battleArtwork[0] && (
                <PreviewBattleCard
                  battle={battleArtwork[0].battle}
                  image={battleArtwork[0].image}
                  accent={battleArtwork[0].accent}
                  outcomeLabel={versionT("previewBattleOutcome")}
                  imageAlt={versionT("previewBattleImageAlt", {
                    title: battleArtwork[0].battle.title,
                  })}
                />
              )}
              <WikiMarkdown body={versionT("previewBuuStoryAfterYakon")} />
              {battleArtwork[1] && (
                <PreviewBattleCard
                  battle={battleArtwork[1].battle}
                  image={battleArtwork[1].image}
                  accent={battleArtwork[1].accent}
                  outcomeLabel={versionT("previewBattleOutcome")}
                  imageAlt={versionT("previewBattleImageAlt", {
                    title: battleArtwork[1].battle.title,
                  })}
                />
              )}
              <WikiMarkdown body={versionT("previewBuuStoryAfterVegeta")} />
              <WikiMarkdown body={versionT("previewBuuStoryBeforeKidBuu")} />
              {battleArtwork[2] && (
                <PreviewBattleCard
                  battle={battleArtwork[2].battle}
                  image={battleArtwork[2].image}
                  accent={battleArtwork[2].accent}
                  outcomeLabel={versionT("previewBattleOutcome")}
                  imageAlt={versionT("previewBattleImageAlt", {
                    title: battleArtwork[2].battle.title,
                  })}
                />
              )}
              <WikiMarkdown body={versionT("previewBuuStoryAfterKidBuu")} />
            </div>
          ),
        };
      }
      if (preview && activeVariant?.slug === "goku-preview-main-majin-buu" && key === "anecdotes") {
        return {
          ...panel,
          group: versionT("anecdotes"),
          node: (
            <div className="space-y-4">
              <p className="rounded-xl border border-dbz-orange/25 bg-dbz-orange/5 px-4 py-3 text-sm leading-relaxed text-white/65">
                {versionT("previewBuuDemoNotice")}
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  [versionT("previewBuuAnecdoteOneTitle"), versionT("previewBuuAnecdoteOne"), "01"],
                  [versionT("previewBuuAnecdoteTwoTitle"), versionT("previewBuuAnecdoteTwo"), "02"],
                  [
                    versionT("previewBuuAnecdoteThreeTitle"),
                    versionT("previewBuuAnecdoteThree"),
                    "03",
                  ],
                  [versionT("previewBuuNameOriginTitle"), versionT("previewBuuNameOrigin"), "04"],
                ].map(([title, body, number]) => (
                  <article key={number} className="dbz-panel border-white/10 p-5">
                    <p className="font-saiyan text-sm tracking-[0.2em] text-dbz-orange">{number}</p>
                    <h3 className="mt-2 text-lg font-bold text-white">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/70">{body}</p>
                    {number === "04" && (
                      <a
                        href="https://en.dragon-ball-official.com/news/01_93.html"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex text-xs font-semibold text-dbz-orange underline underline-offset-4"
                      >
                        {versionT("previewNameOriginSource")}
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ),
        };
      }
      if (/anecdote|trivia|origine-du-nom|apparition|voix/.test(key)) {
        return { ...panel, group: versionT("anecdotes") };
      }
      if (TRANSFO_SECTION_KEYS.has(panel.key) || TECH_SECTION_KEYS.has(panel.key)) {
        return { ...panel, group: versionT("powersAndForms") };
      }
      return panel;
    });

  if (activeVariant) {
    const sagaFacts: Array<{ label: string; value: string }> = [];
    if (activeVariant.form) {
      sagaFacts.push({ label: versionT("form"), value: activeVariant.form });
    }
    if (activeVariant.age != null) {
      sagaFacts.push({
        label: versionT("age"),
        value: `${activeVariant.age} ${versionT("years")}`,
      });
    }
    if (activeVariant.affiliation) {
      sagaFacts.push({ label: versionT("affiliation"), value: activeVariant.affiliation });
    }
    if (activeVariant.firstVolume != null && activeVariant.lastVolume != null) {
      sagaFacts.push({
        label: versionT("manga"),
        value:
          activeVariant.firstVolume === activeVariant.lastVolume
            ? versionT("volumeSingle", { number: activeVariant.firstVolume })
            : versionT("volumesRange", {
                range: `${activeVariant.firstVolume}–${activeVariant.lastVolume}`,
              }),
      });
    }
    if (activeVariant.firstEpisode != null && activeVariant.lastEpisode != null) {
      sagaFacts.push({
        label: versionT("animatedSeries"),
        value: `${activeVariant.episodeSeries ?? ""} ${
          activeVariant.firstEpisode === activeVariant.lastEpisode
            ? versionT("episodeSingle", { number: activeVariant.firstEpisode })
            : versionT("episodesRange", {
                range: `${activeVariant.firstEpisode}–${activeVariant.lastEpisode}`,
              })
        }`.trim(),
      });
    }
    if (activeVariant.evidence?.planches) {
      sagaFacts.push({
        label: versionT("mangaPages"),
        value: String(activeVariant.evidence.planches),
      });
    }
    if (activeVariant.evidence?.synopsis) {
      sagaFacts.push({
        label: versionT("episodeSynopses"),
        value: String(activeVariant.evidence.synopsis),
      });
    }

    const variantHistoryNode = (
      <section className="dbz-panel space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {activeVariant.sagaSeries && (
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                {activeVariant.sagaSeries}
              </p>
            )}
            <h2 className="mt-1 font-saiyan text-xl uppercase tracking-wide text-white sm:text-2xl">
              {activeVariant.sagaName}
            </h2>
            {activeVariant.role && (
              <p className="mt-2 text-xs font-semibold text-white/60">{activeVariant.role}</p>
            )}
          </div>
          <GatedWrap
            href={`/wiki/sagas/${activeVariant.sagaSlug}`}
            className="text-sm font-bold text-dbz-orange hover:text-white"
          >
            {activeVariant.sagaName} →
          </GatedWrap>
        </header>

        {activeVariant.summary?.trim() ? (
          <div className="prose-invert max-w-none text-sm">
            <WikiMarkdown body={activeVariant.summary} />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-white/55">{versionT("noSummary")}</p>
        )}

        {sagaFacts.length > 0 && (
          <dl className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {sagaFacts.map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                  {label}
                </dt>
                <dd className="mt-1 break-words text-sm font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {activeVariant.keyEpisodes && activeVariant.keyEpisodes.length > 0 && (
          <div className="border-t border-white/10 pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/55">
              {versionT("episodesNamed")}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {activeVariant.keyEpisodes.map((episode) => (
                <li key={episode.id}>
                  <GatedWrap
                    href={`/wiki/episodes/${episode.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dbz-border px-3 py-1.5 text-xs text-white/75 transition-colors hover:border-dbz-orange/50 hover:text-white"
                  >
                    <span className="tabular-nums text-dbz-orange/80">#{episode.num}</span>
                    {episode.title}
                  </GatedWrap>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
    const historyIndex = panels.findIndex((panel) =>
      /histoire|history|歴史/i.test(`${panel.key} ${panel.label}`),
    );
    if (historyIndex >= 0) {
      const existingHistoryNode = panels[historyIndex]!.node;
      panels[historyIndex] = {
        ...panels[historyIndex]!,
        node: (
          <div className="space-y-6">
            {variantHistoryNode}
            {existingHistoryNode}
          </div>
        ),
      };
    } else {
      panels.unshift({
        key: "saga-history",
        label: versionT("sagaHistoryHeading"),
        accent: "orange",
        node: variantHistoryNode,
      });
    }
  }

  if (relationItems.length > 0) {
    panels.push({
      key: "relations",
      label: versionT("relationsTitle", { name: pageCharacterName }),
      accent: "cyan",
      node: (
        <CategorizedAffiliates
          relations={relationItems}
          characterName={pageCharacterName}
          access={preview ? null : access}
          familyContent={preview ? undefined : familyContent}
          labels={{
            title: versionT("relationsTitle", { name: "{name}" }),
            intro: versionT("relationsIntro"),
            family: versionT("family"),
            friends: versionT("friends"),
            enemies: versionT("enemies"),
            empty: versionT("emptyRelations"),
          }}
        />
      ),
    });
  }

  const mergeOrAppendGrid = (
    keys: Set<string>,
    has: boolean,
    render: (withHeading: boolean) => ReactNode,
    key: string,
    label: string,
    accent: SectionAccent,
  ) => {
    if (!has || sagaVariants.length > 0) return;
    const idx = panels.findIndex((p) => keys.has(p.key));
    if (idx >= 0) {
      panels[idx] = {
        ...panels[idx],
        node: (
          <div className="space-y-12">
            {panels[idx].node}
            {render(false)}
          </div>
        ),
      };
    } else {
      panels.push({ key, label, accent, node: render(true) });
    }
  };

  mergeOrAppendGrid(
    TRANSFO_SECTION_KEYS,
    character.transformations.length > 0,
    transfoGrid,
    "transformations",
    "Transformations",
    "purple",
  );
  mergeOrAppendGrid(
    TECH_SECTION_KEYS,
    character.techniques.length > 0,
    techGrid,
    "techniques",
    "Techniques",
    "blue",
  );

  for (const panel of panels) {
    if (panel.key === "transformations" || panel.key === "techniques") {
      panel.group = versionT("powersAndForms");
    }
  }

  if (sagaVariants.length > 0) {
    panels.push({
      key: "saga-variants",
      label: versionT("powersAndForms"),
      accent: "purple",
      node: (
        <div className="scroll-mt-24" id="versions-du-personnage">
          <CharacterSagaVariants
            key={activeVariant?.id ?? "character-variants"}
            variants={activeSagaVariants}
            characterName={pageCharacterName}
            activeVariantIndex={0}
            showPortrait={false}
            messages={{
              powersAndForms: versionT("powersAndForms"),
              abilitiesIntro: versionT("abilitiesIntro"),
              intro: versionT("intro", { count: activeSagaVariants.length }),
              overview: versionT("overview"),
              sagaHistoryHeading: versionT("sagaHistoryHeading"),
              form: versionT("form"),
              age: versionT("age"),
              years: versionT("years"),
              affiliation: versionT("affiliation"),
              manga: versionT("manga"),
              animatedSeries: versionT("animatedSeries"),
              mangaPages: versionT("mangaPages"),
              episodeSynopses: versionT("episodeSynopses"),
              imageReference: versionT("imageReference"),
              noImage: versionT("noImage"),
              noSummary: versionT("noSummary"),
              powerAria: versionT("powerAria", { name: "{name}", version: "{version}" }),
              powerHeading: versionT("powerHeading", { version: "{version}" }),
              powerLevel: versionT("powerLevel"),
              ki: versionT("ki"),
              maxKi: versionT("maxKi"),
              noPower: versionT("noPower"),
              transformationsAria: versionT("transformationsAria", {
                name: "{name}",
                version: "{version}",
              }),
              transformations: versionT("transformations"),
              noTransformations: versionT("noTransformations"),
              firstObtainedIn: versionT("firstObtainedIn"),
              techniquesAria: versionT("techniquesAria", {
                name: "{name}",
                version: "{version}",
              }),
              techniques: versionT("techniques"),
              introducedThisSaga: versionT("introducedThisSaga"),
              knownFromEarlierSaga: versionT("knownFromEarlierSaga"),
              noTechniques: versionT("noTechniques"),
              episodesNamed: versionT("episodesNamed"),
              autoSynopsis: versionT("autoSynopsis"),
              autoManga: versionT("autoManga"),
              autoBoth: versionT("autoBoth"),
              volumesRange: versionT("volumesRange", { range: "{range}" }),
              volumeSingle: versionT("volumeSingle", { number: "{number}" }),
              episodesRange: versionT("episodesRange", { range: "{range}" }),
              episodeSingle: versionT("episodeSingle", { number: "{number}" }),
            }}
            powerScalingNodes={activeSagaVariants.map((variant) => {
              const versionSaga = normalizeVersionLabel(variant.sagaName);
              const readings = DEFAULT_POWER_SCALING_CONFIG.officialBps.filter((reading) => {
                const belongsToCharacter =
                  reading.characterId === character.id ||
                  (!reading.characterId &&
                    normalizeVersionLabel(reading.character) ===
                      normalizeVersionLabel(character.name));
                return belongsToCharacter && normalizeVersionLabel(reading.saga) === versionSaga;
              });
              if (readings.length === 0) return null;
              return (
                <div
                  key={`power-readings-${variant.id}`}
                  className="dbz-panel space-y-2 p-4 sm:col-span-3"
                >
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                    {versionT("officialReadings")}
                  </h4>
                  <ul className="space-y-2">
                    {readings.map((reading) => (
                      <li
                        key={`${reading.saga}-${reading.state}-${reading.bp}`}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/10 pt-2 text-sm"
                      >
                        <span className="text-white/80">{reading.state}</span>
                        <span className="font-mono font-bold text-dbz-orange">
                          {reading.bp.toLocaleString(locale)} {versionT("bpUnit")}
                        </span>
                        <span className="w-full text-xs text-white/45">
                          {reading.source} ·{" "}
                          {reading.scouter
                            ? versionT("scouterSource")
                            : versionT("daizenshuuSource")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            transformationNodes={activeSagaVariants.map((variant) => {
              const items = character.transformations.filter((item) =>
                variant.transformationIds?.includes(item.id),
              );
              return items.length ? (
                transformationCards(items, `transformations-${variant.id}`)
              ) : (
                <p key={`transformations-${variant.id}`} className="text-sm text-white/55">
                  {versionT("noTransformations")}
                </p>
              );
            })}
            techniqueNodes={activeSagaVariants.map((variant) => {
              const sourceTypeLabel = (sourceType: string) => {
                switch (sourceType) {
                  case "manga":
                    return versionT("techniqueSourceManga");
                  case "anime":
                    return versionT("techniqueSourceAnime");
                  case "movie":
                    return versionT("techniqueSourceMovie");
                  case "game":
                    return versionT("techniqueSourceGame");
                  default:
                    return versionT("techniqueSourceOther");
                }
              };
              return (
                <div key={`techniques-${variant.id}`} className="space-y-5">
                  {techniquesInArc.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                      {techniquesInArc.map(({ technique }) => {
                        const uses = currentTechniqueUses.filter(
                          (use) => use.techniqueId === technique.id,
                        );
                        return (
                          <details
                            key={technique.id}
                            className="group min-w-0 overflow-hidden rounded-2xl border border-dbz-blue-light/15 bg-black/20 transition-colors open:border-dbz-blue-light/35"
                          >
                            <summary className="relative block aspect-square cursor-pointer list-none overflow-hidden bg-dbz-blue-light/[0.08] marker:content-none [&::-webkit-details-marker]:hidden">
                              <WikiImg
                                src={
                                  technique.image ?? TECHNIQUE_PREVIEW_IMAGES[technique.slug] ?? ""
                                }
                                alt=""
                                loading="lazy"
                                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                                placeholderClassName="absolute inset-0 flex items-center justify-center"
                              />
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/10"
                              />
                              <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white/80 backdrop-blur-sm">
                                <ChevronDown
                                  className="size-4 transition-transform group-open:rotate-180"
                                  aria-hidden="true"
                                />
                              </span>
                              <h4 className="absolute inset-x-1.5 bottom-1.5 line-clamp-2 rounded-lg border border-white/15 bg-black/90 px-2 py-1.5 text-center text-xs font-extrabold leading-snug text-white shadow-[0_2px_12px_rgba(0,0,0,0.95)] sm:inset-x-2 sm:bottom-2 sm:px-2.5 sm:py-2 sm:text-sm">
                                {technique.name}
                              </h4>
                            </summary>
                            <div className="space-y-3 border-t border-white/10 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <GatedWrap
                                  href={`/wiki/techniques/${technique.slug}`}
                                  className="text-xs font-bold text-white hover:text-dbz-blue-light"
                                >
                                  {technique.name}
                                </GatedWrap>
                                <span className="rounded-full border border-dbz-blue-light/20 bg-dbz-blue-light/[0.08] px-2 py-1 text-[8px] font-bold uppercase leading-tight tracking-wide text-dbz-blue-light">
                                  {earlierTechniqueIds.has(technique.id)
                                    ? versionT("knownFromEarlierSaga")
                                    : versionT("introducedThisSaga")}
                                </span>
                              </div>
                              {uses.length > 0 ? (
                                <ol className="space-y-0 border-l border-dbz-blue-light/20">
                                  {uses.map((use, index) => {
                                    const href = techniqueSourceHref(use.sourceUrl);
                                    return (
                                      <li
                                        key={use.id}
                                        className="relative flex gap-2 pb-3 pl-3 text-xs leading-relaxed text-white/75 last:pb-0"
                                      >
                                        <span
                                          className="absolute -left-[5px] top-1.5 size-2 rounded-full border border-dbz-blue-light/50 bg-dbz-card"
                                          aria-hidden="true"
                                        />
                                        <span className="shrink-0 font-mono text-[9px] tabular-nums text-white/35">
                                          {String(index + 1).padStart(2, "0")}
                                        </span>
                                        <div>
                                          <span className="mr-1 rounded-md bg-white/[0.06] px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/50">
                                            {sourceTypeLabel(use.sourceType)}
                                          </span>
                                          {href ? (
                                            <a
                                              href={href}
                                              target={href.startsWith("/") ? undefined : "_blank"}
                                              rel={href.startsWith("/") ? undefined : "noreferrer"}
                                              className="font-semibold text-white underline decoration-dbz-orange/40 underline-offset-4 hover:text-dbz-orange"
                                            >
                                              {use.sourceLabel}
                                            </a>
                                          ) : (
                                            <span className="font-semibold text-white">
                                              {use.sourceLabel}
                                            </span>
                                          )}
                                          {use.note && (
                                            <p className="mt-1 text-[10px] text-white/55">
                                              {use.note}
                                            </p>
                                          )}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ol>
                              ) : (
                                <p className="text-[10px] leading-relaxed text-white/50">
                                  {versionT("techniqueUsesMissing")}
                                </p>
                              )}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-white/55">{versionT("noTechniques")}</p>
                  )}
                  {knownButUnusedTechniques.length > 0 && (
                    <details className="group rounded-xl border border-white/10 bg-black/15">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white/65 marker:content-none hover:text-white [&::-webkit-details-marker]:hidden">
                        {versionT("knownButUnusedTechniques")}
                        <ChevronDown
                          className="size-4 shrink-0 transition-transform group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <ul className="grid gap-2 border-t border-white/10 p-3 sm:grid-cols-2">
                        {knownButUnusedTechniques.map(({ technique }) => {
                          const lastUse = lastUseByTechnique.get(technique.id);
                          const href = techniqueSourceHref(lastUse?.sourceUrl ?? null);
                          return (
                            <li
                              key={technique.id}
                              className="rounded-lg border border-white/10 bg-black/15 px-4 py-3"
                            >
                              <GatedWrap
                                href={`/wiki/techniques/${technique.slug}`}
                                className="font-semibold text-white/80 hover:text-dbz-orange"
                              >
                                {technique.name}
                              </GatedWrap>
                              <p className="mt-1 text-xs leading-relaxed text-white/50">
                                {lastUse ? (
                                  <>
                                    {versionT("lastTechniqueUse")} ·{" "}
                                    {sourceTypeLabel(lastUse.sourceType)}:{" "}
                                    {href ? (
                                      <a
                                        href={href}
                                        target={href.startsWith("/") ? undefined : "_blank"}
                                        rel={href.startsWith("/") ? undefined : "noreferrer"}
                                        className="underline underline-offset-2 hover:text-white"
                                      >
                                        {lastUse.sourceLabel}
                                      </a>
                                    ) : (
                                      lastUse.sourceLabel
                                    )}
                                  </>
                                ) : (
                                  versionT("lastTechniqueUseMissing")
                                )}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          />
        </div>
      ),
    });
  }

  if (pageVoiceActors.length) {
    panels.push({
      key: "voix",
      label: versionT("voiceActors"),
      group: versionT("anecdotes"),
      accent: "gold",
      node: (
        <section className="space-y-4">
          <h2 className="font-saiyan text-2xl text-white">{versionT("voiceActors")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {pageVoiceActors.map((actor) => (
              <li key={actor.id} className="dbz-panel relative isolate min-h-32 overflow-hidden">
                {preview && actor.image && (
                  <div
                    className="absolute inset-y-0 left-0 w-[46%] overflow-hidden"
                    style={{
                      maskImage: "linear-gradient(to right, black 0%, black 54%, transparent 100%)",
                      WebkitMaskImage:
                        "linear-gradient(to right, black 0%, black 54%, transparent 100%)",
                    }}
                  >
                    <WikiImg
                      src={actor.image}
                      alt={actor.name}
                      className="h-full w-full object-cover object-[center_28%] opacity-55"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="relative z-10 ml-[39%] min-h-32 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                    {actor.nationality === "ja"
                      ? versionT("japaneseVoice")
                      : actor.nationality === "fr"
                        ? versionT("frenchVoice")
                        : versionT("voiceLabel", { nationality: actor.nationality.toUpperCase() })}
                  </p>
                  <div className="mt-1 font-semibold text-dbz-orange">
                    {preview ? (
                      <Link href={`/wiki/contributors/${actor.slug}`} className="hover:underline">
                        {actor.name}
                      </Link>
                    ) : (
                      <GatedWrap href="/wiki/staff?tier=voice" className="hover:underline">
                        {actor.name}
                      </GatedWrap>
                    )}
                    {actor.nameJa && (
                      <span lang="ja" className="ml-2 font-jp text-xs text-white/70">
                        {actor.nameJa}
                      </span>
                    )}
                  </div>
                  {actor.roleNotes && (
                    <p className="mt-1 text-xs leading-relaxed text-white/50">{actor.roleNotes}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ),
    });
  }

  const isDemoBuuCredits = preview && activeVariant?.slug === "goku-preview-main-majin-buu";
  const demoAnimationCredits: CharacterVariantStaffCredit[] = isDemoBuuCredits
    ? [
        {
          id: -601,
          variantId: activeVariant.id,
          episodeNumber: "223",
          sceneTitle: versionT("previewCreditYakon"),
          animationSupervisor: "Masayuki Uchiyama",
          supervisorSlug: "masayuki-uchiyama",
          keyAnimators: "Last House · Tai’ichirō Ohara",
          image: "/dbz/characters/babidi.webp",
          altText: "Illustration de l’épisode 223",
          sourceUrl: "https://www.kanzenshuu.com/wiki/Dragon_Ball_Z_Episode_223",
          episodeUrl: "https://lineup.toei.co.jp/ja/tv/dragonz/episode/223/",
          sortOrder: 1,
        },
        {
          id: -602,
          variantId: activeVariant.id,
          episodeNumber: "229",
          sceneTitle: versionT("previewCreditVegeta"),
          animationSupervisor: "Shingo Ishikawa",
          supervisorSlug: "shingo-ishikawa",
          keyAnimators:
            "K-Production · Atsushi Matsumoto · Shigeki Satō · Miyako Jingū · Mizue Ogawa · Hiroyuki Yokota",
          image: "/dbz/transformations/vegeta-ssj2.webp",
          altText: "Illustration de l’épisode 229",
          sourceUrl: "https://www.kanzenshuu.com/wiki/Dragon_Ball_Z_Episode_229",
          episodeUrl: "https://lineup.toei.co.jp/ja/tv/dragonz/episode/229/",
          sortOrder: 2,
        },
        {
          id: -603,
          variantId: activeVariant.id,
          episodeNumber: "245",
          sceneTitle: versionT("previewCreditBuu"),
          animationSupervisor: "Ichio Hayashi",
          supervisorSlug: null,
          keyAnimators: "Kino Production · Yasunari Hayashi · Naoaki Hōjō · Takashi Inaba",
          image: "/dbz/transformations/goku-ssj3.webp",
          altText: "Illustration de l’épisode 245",
          sourceUrl: "https://www.kanzenshuu.com/wiki/Dragon_Ball_Z_Episode_245",
          episodeUrl: "https://lineup.toei.co.jp/ja/tv/dragonz/episode/245/",
          sortOrder: 3,
        },
        {
          id: -604,
          variantId: activeVariant.id,
          episodeNumber: "285",
          sceneTitle: versionT("previewCreditGenkiDama"),
          animationSupervisor: "Tadayoshi Yamamuro",
          supervisorSlug: "tadayoshi-yamamuro",
          keyAnimators:
            "Shindō Production · Noriko Shibata · Akemi Ueda · Kumiko Horikoshi · Kazue Kinoshita · Nobuyuki Harada",
          image: "/techniques/genkidama.webp",
          altText: "Illustration de l’épisode 285",
          sourceUrl: "https://www.kanzenshuu.com/wiki/Dragon_Ball_Z_Episode_285",
          episodeUrl: "https://lineup.toei.co.jp/ja/tv/dragonz/episode/285/",
          sortOrder: 4,
        },
        {
          id: -605,
          variantId: activeVariant.id,
          episodeNumber: "286",
          sceneTitle: versionT("previewCreditGenkiDama"),
          animationSupervisor: "Yūji Hakamada",
          supervisorSlug: null,
          keyAnimators:
            "Studio Carpenter · Shin’ichirō Fukushima · Takayuki Manaka · Toshiyuki Kan’no · Hitoshi Kamata · Takeo Ide · Shingo Ishikawa",
          image: "/techniques/genkidama.webp",
          altText: "Illustration de l’épisode 286",
          sourceUrl: "https://www.kanzenshuu.com/wiki/Dragon_Ball_Z_Episode_286",
          episodeUrl: "https://lineup.toei.co.jp/ja/tv/dragonz/episode/286/",
          sortOrder: 5,
        },
      ]
    : [];
  const animationCredits = isDemoBuuCredits ? demoAnimationCredits : activeVariantStaffCredits;
  if (animationCredits.length > 0) {
    panels.push({
      key: "equipe-animation",
      label: versionT("previewAnimationCredits"),
      group: versionT("anecdotes"),
      accent: "gold",
      node: (
        <section className="space-y-4">
          <header>
            <h2 className="font-saiyan text-2xl text-white">
              {versionT("previewAnimationCredits")}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              {versionT("previewCreditsScope")}
            </p>
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            {animationCredits.map((credit) => {
              const episodeHref = techniqueSourceHref(credit.episodeUrl);
              const sourceHref = techniqueSourceHref(credit.sourceUrl);
              return (
                <article
                  key={credit.id}
                  className="dbz-panel relative isolate min-h-36 overflow-hidden border-white/10"
                >
                  {credit.image && (
                    <div
                      className="absolute inset-y-0 left-0 w-[46%] overflow-hidden"
                      style={{
                        maskImage:
                          "linear-gradient(to right, black 0%, black 54%, transparent 100%)",
                        WebkitMaskImage:
                          "linear-gradient(to right, black 0%, black 54%, transparent 100%)",
                      }}
                    >
                      <WikiImg
                        src={credit.image}
                        alt={
                          credit.altText ||
                          versionT("previewCreditArtAlt", { episode: credit.episodeNumber })
                        }
                        className="h-full w-full object-cover opacity-55"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="relative z-10 ml-[39%] p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-dbz-orange">
                      {versionT("previewEpisodeLabel")} {credit.episodeNumber}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-white">{credit.sceneTitle}</h3>
                    <p className="mt-2 text-sm text-white/75">
                      {versionT("previewAnimationSupervisor")}:{" "}
                      {credit.supervisorSlug ? (
                        <Link
                          className="font-semibold text-dbz-orange underline decoration-white/20 underline-offset-4 hover:decoration-dbz-orange"
                          href={`/wiki/contributors/${credit.supervisorSlug}`}
                        >
                          {credit.animationSupervisor}
                        </Link>
                      ) : (
                        <Link
                          className="font-semibold text-dbz-orange hover:underline"
                          href="/wiki/staff"
                        >
                          {credit.animationSupervisor}
                        </Link>
                      )}
                    </p>
                    {credit.keyAnimators && (
                      <p className="mt-2 text-xs leading-relaxed text-white/55">
                        {versionT("previewKeyAnimation")}:{" "}
                        <Link
                          href="/wiki/staff"
                          className="underline decoration-white/20 underline-offset-4 hover:text-white"
                        >
                          {credit.keyAnimators}
                        </Link>
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {episodeHref && (
                        <a
                          className="text-white/65 underline underline-offset-4 hover:text-white"
                          href={episodeHref}
                          target={episodeHref.startsWith("/") ? undefined : "_blank"}
                          rel={episodeHref.startsWith("/") ? undefined : "noreferrer"}
                        >
                          {versionT("previewOfficialEpisodeSource")}
                        </a>
                      )}
                      {sourceHref && (
                        <a
                          className="text-white/65 underline underline-offset-4 hover:text-white"
                          href={sourceHref}
                          target={sourceHref.startsWith("/") ? undefined : "_blank"}
                          rel={sourceHref.startsWith("/") ? undefined : "noreferrer"}
                        >
                          {versionT("previewCreditsSource")}
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ),
    });
  }

  const supplementalPanels = panels.filter((panel) => panel.group === versionT("anecdotes"));
  if (supplementalPanels.length > 0) {
    const supplementalKeys = new Set(supplementalPanels.map((panel) => panel.key));
    for (let index = panels.length - 1; index >= 0; index--) {
      if (supplementalKeys.has(panels[index]!.key)) panels.splice(index, 1);
    }
    panels.push({
      key: "informations-complementaires",
      label: versionT("additionalInformation"),
      accent: "gold",
      node: (
        <section className="relative isolate overflow-hidden rounded-2xl border border-dbz-orange/25 bg-gradient-to-br from-dbz-orange/[0.08] via-black/30 to-dbz-red/[0.06] p-4 shadow-[0_18px_60px_-35px_rgba(255,128,0,0.45)] sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-dbz-orange/10 blur-3xl" />
          <header className="mb-6 flex items-start gap-3 border-b border-white/10 pb-5">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-dbz-orange/25 bg-dbz-orange/10 text-dbz-orange">
              <Sparkles aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="font-saiyan text-xl text-white sm:text-2xl">
                {versionT("additionalInformation")}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">
                {versionT("additionalInformationIntro")}
              </p>
            </div>
          </header>
          <div className="space-y-8">
            {supplementalPanels.map((panel) => (
              <div key={panel.key} className="min-w-0">
                {panel.node}
              </div>
            ))}
          </div>
        </section>
      ),
    });
  }

  // Saga-specific power readings are already rendered with the selected variant.
  // Keep the cross-saga panel only when there is no saga record to scope it to.
  if (!activeVariant) {
    panels.push({
      key: "power-scaling",
      label: "Power Scaling (BP & Kiri)",
      group: versionT("powersAndForms"),
      accent: "orange",
      node: <CharacterPowerScaling characterName={pageCharacterName} characterId={character.id} />,
    });
  }

  // Panneau Combats Légendaires issus de bot.db_battles
  if (
    variantBattles.length > 0 &&
    !(preview && activeVariant?.slug === "goku-preview-main-majin-buu")
  ) {
    panels.push({
      key: "combats",
      label: `Combats (${variantBattles.length})`,
      accent: "red",
      node: (
        <section className="space-y-8">
          <div className="flex items-center gap-6">
            <h2 className="font-saiyan text-2xl sm:text-4xl md:text-5xl text-dbz-red uppercase tracking-widest">
              COMBATS LÉGENDAIRES
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-dbz-red/50 to-transparent" />
          </div>
          <p className="text-sm text-white/50 max-w-3xl">
            Duels majeurs et confrontations épiques de {character.name} relatés dans le manga et
            l&apos;histoire canonique.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {variantBattles.map((b) => (
              <GatedWrap
                key={b.id}
                href="/wiki/events"
                className="dbz-panel p-5 hover:border-dbz-red/50 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-dbz-red mb-2">
                    <span>⚔️ {b.series}</span>
                    {b.location && <span className="text-white/40">{b.location}</span>}
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-dbz-red transition-colors">
                    {b.title}
                  </h3>
                  {b.titleJa && (
                    <p lang="ja" className="font-jp text-xs text-white/40 mt-1">
                      {b.titleJa}
                    </p>
                  )}
                  {b.climaxSummary && (
                    <p className="text-xs text-gray-400 mt-3 leading-relaxed line-clamp-3">
                      {b.climaxSummary}
                    </p>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <span className="text-white/50">
                    Vainqueur :{" "}
                    <strong className="text-white">{b.winnerName || "Indéterminé"}</strong>
                  </span>
                  <span className="text-dbz-red font-bold group-hover:translate-x-1 transition-transform">
                    Détails →
                  </span>
                </div>
              </GatedWrap>
            ))}
          </div>
        </section>
      ),
    });
  }

  const infobox = (
    <div className="wiki-infobox">
      {/* Portrait principal */}
      {/* Main character art with optional editor-added appearance thumbnails. */}
      <CharacterPortraitWithTransformations
        key={activeVariant?.id ?? character.id}
        src={heroImage}
        fallback={heroImage === character.image ? character.portraitXv2 : character.image}
        alt={pageCharacterName}
        appearances={activePortraitAppearances.map((appearance) => ({
          id: appearance.id,
          image: appearance.image,
          label:
            appearance.transformationName || appearance.altText.trim() || versionT("appearance"),
        }))}
        appearanceLabel={versionT("appearance")}
        officialLabel={versionT("officialData")}
        viewTransitionName={`character-img-${character.id}`}
      />

      <CharacterPageSelectors
        character={{ id: character.id, name: character.name, slug: character.slug }}
        versions={versionChoices}
        previewChoices={previewChoices}
        variants={sagaVariants}
        selectedTimelineSlug={
          isSummaryVersion ? "goku-summary" : preview ? previewTimeline : character.slug
        }
        selectedSagaSlug={activeVariant?.slug ?? null}
        preview={preview}
        labels={{
          version: versionT("versionLabel"),
          saga: versionT("sagaLabel"),
          main: versionT("mainTimeline"),
          loading: versionT("loadingVersion"),
        }}
      />

      {/* Attributs structurés */}
      <div className="divide-y divide-white/[0.08]">
        <div className="wiki-infobox-row">
          <span className="wiki-infobox-label">Nom officiel</span>
          <span className="wiki-infobox-value">{pageCharacterName}</span>
        </div>
        {pageCharacterNameJa && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Japonais</span>
            <span lang="ja" className="wiki-infobox-value font-jp text-dbz-orange">
              {pageCharacterNameJa}
            </span>
          </div>
        )}
        {character.nameRomaji && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Romaji</span>
            <span className="wiki-infobox-value italic">{character.nameRomaji}</span>
          </div>
        )}
        {character.race && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Race</span>
            <Link
              href={`/wiki/races/${slugDeRace(character.race, character.name)}`}
              className="wiki-infobox-value text-dbz-yellow underline decoration-dbz-yellow/30 underline-offset-4 hover:decoration-dbz-yellow"
            >
              {character.race}
            </Link>
          </div>
        )}
        {pageAffiliation && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Affiliation</span>
            <span className="wiki-infobox-value">{pageAffiliation}</span>
          </div>
        )}
        {activeVariant?.age != null && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">{versionT("age")}</span>
            <span className="wiki-infobox-value">
              {activeVariant.age} {versionT("years")}
            </span>
          </div>
        )}
        {character.originPlanet && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Planète</span>
            <span className="wiki-infobox-value text-dbz-cyan">{character.originPlanet.name}</span>
          </div>
        )}
        {(activeVariant?.ki ?? character.ki) && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Ki de base</span>
            <span className="wiki-infobox-value font-mono text-dbz-orange">
              {activeVariant?.ki ?? character.ki}
            </span>
          </div>
        )}
        {(activeVariant?.maxKi ?? character.maxKi) && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Ki maximum</span>
            <span className="wiki-infobox-value font-mono text-dbz-red">
              {activeVariant?.maxKi ?? character.maxKi}
            </span>
          </div>
        )}
        {!activeVariant &&
          character.stats?.map((st) => (
            <div key={st.label} className="wiki-infobox-row">
              <span className="wiki-infobox-label">{st.label}</span>
              <span className="wiki-infobox-value font-mono text-dbz-yellow">{st.value}</span>
            </div>
          ))}
      </div>
    </div>
  );

  return (
    <WikiDetailPage
      entity={character.name}
      source="db_characters"
      jsonLd={personSchema}
      tracker={
        <TrackView
          entityType="character"
          entityId={character.id}
          entityName={pageCharacterName}
          image={heroImage}
        />
      }
      crumbs={[{ label: "L'Univers", href: "/wiki/characters" }, { label: pageCharacterName }]}
      edit={{
        table: "db_characters",
        id: character.id,
        indexHref: "/wiki/characters",
        label: pageCharacterName,
      }}
      header={
        <WikiEntityHeader
          name={pageCharacterName}
          nameJa={pageCharacterNameJa}
          nameRomaji={character.nameRomaji}
          badges={
            <>
              {character.race && (
                <Link
                  href={`/wiki/races/${slugDeRace(character.race, character.name)}`}
                  className="toriyama-badge bg-dbz-orange px-3.5 py-1 text-xs font-black text-black hover:underline"
                >
                  <span>{character.race}</span>
                </Link>
              )}
              {pageAffiliation && (
                <span className="toriyama-badge bg-white px-3.5 py-1 text-xs font-black text-black">
                  <span>{pageAffiliation}</span>
                </span>
              )}
              {character.originPlanet && (
                <span className="toriyama-badge border-2 border-dbz-cyan bg-[#141416] px-3.5 py-1 text-xs font-black text-dbz-cyan">
                  <span>{character.originPlanet.name}</span>
                </span>
              )}
            </>
          }
        />
      }
      aside={infobox}
      asidePosition="left"
    >
      <div className="space-y-10">
        <WikiSectionsReader panels={panels} />
        <WikiSources sources={character.articleSources} />
        <EntityParticipation
          kind="wiki"
          table="db_characters"
          id={character.id}
          path={`/wiki/characters/${slug}`}
          label={pageCharacterName}
        />
      </div>
    </WikiDetailPage>
  );
}
