import { hasEditorialDatabase } from "@/lib/prerender";
import { EntityParticipation } from "@/components/social/EntityParticipation";
import { TrackView } from "@/components/TrackView";
import { ViewTransition } from "@aphrody/shenron-ui/layout/ViewTransition";
import { WikiSources } from "@/components/wiki/WikiArticle";
import { CategorizedAffiliates } from "@/components/wiki/CategorizedAffiliates";
import { getShenronCharacterRelations, type CharacterRelationItem } from "@/lib/shenron";
import { CharacterSagaVariants } from "@/components/wiki/CharacterSagaVariants";
import { CharacterPageSelectors } from "@/components/wiki/CharacterPageSelectors";
import { WikiSectionsReader, type ReaderPanel } from "@/components/wiki/WikiSectionsReader";
import { WikiImg } from "@/components/wiki/WikiImg";
import { CharacterPowerScaling } from "@/components/wiki/CharacterPowerScaling";
import { DEFAULT_POWER_SCALING_CONFIG } from "@/lib/canon-engine";
import { buildWikiContentPanels } from "@/lib/wiki-panels";
import { TECH_SECTION_KEYS, TRANSFO_SECTION_KEYS } from "@/lib/wiki-article-sections";
import {
  getShenronCharacter,
  getShenronCharacterCards,
  getShenronCharacterContinuities,
  getShenronCharacterIds,
  getShenronCharacterVariants,
  getShenronCharacterVariantBattles,
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
import { pickBestImage } from "@/lib/image-variants";
import { getLocale } from "next-intl/server";
import { getWikiCharacterVersionText } from "@/lib/wiki-character-version-messages";
import { verifiedCharacterVariantImage } from "@/lib/wiki-image-evidence";
import {
  createGokuPreviewVariants,
  getGokuPreviewTimelines,
  getGokuPreviewRelationSlugs,
  getGokuPreviewBattles,
  resolveGokuPreviewTimeline,
} from "@/lib/goku-character-preview";
import { CHARACTER_CANONICAL_SLUGS, resolveCharacterParam } from "@/lib/wiki-slugs";

export const revalidate = 3600;

/** Fiches prérendues au build ; l'ISR sert toutes les autres à la demande. */
const PRERENDU = 100;

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
  }>;
  preview?: boolean;
}) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as { saga?: string | string[]; timeline?: string | string[] }),
  ]);
  const resolved = resolveCharacterParam(slug);
  const character = await getChar(resolved.canonicalSlug ?? resolved.id ?? slug);

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
  const [loadedVariants, access, previewCharacterCards, continuities] = await Promise.all([
    preview ? Promise.resolve([]) : getShenronCharacterVariants(character.id),
    getLaunchConfig().catch(() => null),
    preview ? getShenronCharacterCards().catch(() => []) : Promise.resolve([]),
    preview ? Promise.resolve([]) : getShenronCharacterContinuities(character.id),
  ]);
  const locale = await getLocale();
  const versionT = getWikiCharacterVersionText(locale);
  const isGokuMainCharacter = normalizeVersionLabel(character.name) === "songoku";
  const requestedTimeline = Array.isArray(query.timeline) ? query.timeline[0] : query.timeline;
  const previewTimeline = resolveGokuPreviewTimeline(requestedTimeline);
  const previewChoices = isGokuMainCharacter
    ? getGokuPreviewTimelines(versionT, character.name)
    : [];
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
  const sagaVariants = variants;
  const requestedSaga = Array.isArray(query.saga) ? query.saga[0] : query.saga;
  const activeVariant =
    sagaVariants.find((variant) => variant.slug === requestedSaga) ?? sagaVariants[0] ?? null;
  const variantBattles = activeVariant
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
  const heroImage =
    sagaImage ?? pickBestImage([character.image, character.portraitXv2]) ?? character.image;
  const pageCharacterName =
    (preview && isGokuMainCharacter
      ? previewChoices.find((choice) => choice.slug === previewTimeline)?.name
      : null) ??
    activeVariant?.displayName ??
    character.name;
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
    article: activeVariant
      ? activeVariant.article?.trim() ||
        `## ${versionT("sagaHistoryHeading")}\n\n${versionT("sagaHistoryMissing")}`
      : character.article,
    description: activeVariant ? activeVariant.summary : character.description,
    preferArticle: Boolean(activeVariant),
    articleTarget: activeVariant
      ? { table: "db_character_variants", rowId: activeVariant.id }
      : undefined,
  });

  // Galeries relationnelles (vignettes de transformations, fiches techniques).
  // `withHeading=false` quand on les fusionne dans une catégorie de l'article
  // qui porte déjà son titre (évite un double bandeau).
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-6">
        {character.transformations.map((transfo) => (
          <div
            key={transfo.id}
            className="dbz-panel p-4 flex flex-col items-center group hover:scale-105 transition-transform duration-300"
          >
            <div className="aspect-square w-full bg-dbz-bg border border-dbz-border p-2 mb-4 overflow-hidden relative rounded-lg">
              <div className="absolute inset-0 halftone opacity-10" />
              {/* `WikiImg` et non `<img>` : `mapTransfo` remplace une image
							    absente par une chaîne VIDE, et `assetUrl("")` rend "". Le
							    navigateur résout alors `src=""` en l'URL de la PAGE : il la
							    retélécharge en entier pour dessiner une vignette cassée. Le
							    repli du composant montre un repère neutre, et l'image
							    existante devient paresseuse (ces vignettes sont en bas de
							    fiche, derrière le sélecteur de catégories). */}
              <WikiImg
                src={transfo.image}
                alt={transfo.name}
                className="w-full h-full object-contain relative z-10 group-hover:scale-110 transition-transform duration-700"
                placeholderClassName="relative z-10 flex h-full w-full items-center justify-center rounded"
              />
            </div>
            <h3 className="text-xs font-bold text-white uppercase text-center group-hover:text-dbz-orange transition-colors leading-tight tracking-widest">
              {transfo.name}
            </h3>
            {transfo.ki && <span className="scouter-text text-[10px] mt-2">KI: {transfo.ki}</span>}
          </div>
        ))}
      </div>
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
      if (/anecdote|trivia|origine-du-nom|apparition|voix/.test(key)) {
        return { ...panel, group: versionT("anecdotes") };
      }
      if (TRANSFO_SECTION_KEYS.has(panel.key) || TECH_SECTION_KEYS.has(panel.key)) {
        return { ...panel, group: versionT("powersAndForms") };
      }
      return panel;
    });

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
            access={access}
            activeVariantIndex={0}
            showPortrait={false}
            messages={{
              intro: versionT("intro", { count: activeSagaVariants.length }),
              overview: versionT("overview"),
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
              techniquesAria: versionT("techniquesAria", {
                name: "{name}",
                version: "{version}",
              }),
              techniques: versionT("techniques"),
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
                <ul key={`transformations-${variant.id}`} className="flex flex-wrap gap-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-dbz-border px-3 py-2 text-sm text-white/85"
                    >
                      {item.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={`transformations-${variant.id}`} className="text-sm text-white/55">
                  {versionT("noTransformations")}
                </p>
              );
            })}
            techniqueNodes={activeSagaVariants.map((variant) => {
              const items = character.techniques.filter(({ technique }) =>
                variant.techniqueIds?.includes(technique.id),
              );
              return items.length ? (
                <ul key={`techniques-${variant.id}`} className="flex flex-wrap gap-2">
                  {items.map(({ technique }) => (
                    <li
                      key={technique.id}
                      className="rounded-lg border border-dbz-border px-3 py-2 text-sm text-white/85"
                    >
                      {technique.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={`techniques-${variant.id}`} className="text-sm text-white/55">
                  {versionT("noTechniques")}
                </p>
              );
            })}
          />
        </div>
      ),
    });
  }

  if (character.voiceActors?.length) {
    panels.push({
      key: "voix",
      label: versionT("voiceActors"),
      group: versionT("anecdotes"),
      accent: "gold",
      node: (
        <section className="space-y-4">
          <h2 className="font-saiyan text-2xl text-white">{versionT("voiceActors")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {character.voiceActors.map((actor) => (
              <li key={actor.id} className="dbz-panel p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                  {actor.nationality === "ja"
                    ? versionT("japaneseVoice")
                    : actor.nationality === "fr"
                      ? versionT("frenchVoice")
                      : versionT("voiceLabel", { nationality: actor.nationality.toUpperCase() })}
                </p>
                <div className="mt-1 font-semibold text-dbz-orange">
                  <GatedWrap href="/wiki/staff?tier=voice" className="hover:underline">
                    {actor.name}
                  </GatedWrap>
                  {actor.nameJa && (
                    <span lang="ja" className="ml-2 font-jp text-xs text-white/70">
                      {actor.nameJa}
                    </span>
                  )}
                </div>
                {actor.roleNotes && (
                  <p className="mt-1 text-xs leading-relaxed text-white/50">{actor.roleNotes}</p>
                )}
              </li>
            ))}
          </ul>
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
  if (variantBattles.length > 0) {
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
      <div className="wiki-infobox-header">DONNÉES OFFICIELLES //</div>

      {/* Portrait principal */}
      <div className="p-4 bg-[#0a0a0c] border-b-2 border-black flex justify-center items-center relative overflow-hidden group">
        <div className="absolute inset-0 halftone opacity-10" />
        <ViewTransition name={`character-img-${character.id}`} share="morph">
          {/* Meilleure résolution existante en premier (image éditoriale,
								    portrait XV2 ou copie plus grande de la même image, mesurées
								    par l'inventaire) ; l'autre reste en repli. */}
          <WikiImg
            src={heroImage}
            fallback={heroImage === character.image ? character.portraitXv2 : character.image}
            alt={pageCharacterName}
            loading="eager"
            className="max-h-[320px] w-auto object-contain relative z-10 drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] transition-transform duration-500 group-hover:scale-105 sm:max-h-[380px]"
            placeholderClassName="relative z-10 w-full aspect-[3/4] flex items-center justify-center bg-dbz-card overflow-hidden rounded"
          />
        </ViewTransition>
      </div>

      <CharacterPageSelectors
        character={{ id: character.id, name: character.name, slug: character.slug }}
        versions={
          continuities.length > 0
            ? continuities.map(({ id, name, slug, label, isMain }) => ({
                id,
                name,
                slug,
                label,
                isMain,
              }))
            : character.versions.map(({ id, name, slug }) => ({ id, name, slug }))
        }
        previewChoices={previewChoices}
        variants={sagaVariants}
        selectedTimelineSlug={preview ? previewTimeline : character.slug}
        selectedSagaSlug={activeVariant?.slug ?? null}
        preview={preview}
        labels={{
          version: versionT("versionLabel"),
          saga: versionT("sagaLabel"),
          main: versionT("mainTimeline"),
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
            <span className="wiki-infobox-value text-dbz-yellow">{character.race}</span>
          </div>
        )}
        {pageAffiliation && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">Affiliation</span>
            <span className="wiki-infobox-value">{pageAffiliation}</span>
          </div>
        )}
        {activeVariant?.form && (
          <div className="wiki-infobox-row">
            <span className="wiki-infobox-label">{versionT("form")}</span>
            <span className="wiki-infobox-value text-dbz-orange">{activeVariant.form}</span>
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
                <span className="toriyama-badge bg-dbz-orange px-3.5 py-1 text-xs font-black text-black">
                  <span>{character.race}</span>
                </span>
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
