/**
 * L'accueil — une page d'entrée d'application, pensée pour le téléphone d'abord.
 *
 * Ordre de lecture (celui du DOM, donc celui du téléphone et du lecteur
 * d'écran) : le héros (wordmark de couverture, Kinto-Un, clips, recherche),
 * choisir une rubrique, reprendre, l'activité du serveur, les blocs éditoriaux
 * chacun sur son clip, « Explorer aussi », puis TOUT EN BAS les dernières
 * nouvelles et enfin les mini-jeux. Sur grand écran, la même séquence se pose
 * sur une grille de douze colonnes.
 *
 * Ce qui reste piloté par `/admin/home` : la phrase et le lien de l'en-tête,
 * l'activation, l'ordre, les titres et les textes des blocs éditoriaux, les
 * sections personnalisées, l'arbitre de canonicité et « Explorer aussi ».
 * Ce qui est fixe : la recherche, l'accès rapide, la reprise et les mini-jeux —
 * ce sont les fonctions de la page, pas des contenus.
 *
 * Composant SANS état : il se rend côté serveur, et tel quel dans les tests.
 * Les îlots client (recherche, direct, reprise, best-of, tops) se montent dedans.
 */
import Link from "next/link";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { T } from "@/components/T";
import { FeedLead, FeedStream } from "@/components/feed/FeedStream";
import { ContinueRail } from "@/components/history/ContinueRail";
import { CommunityTops } from "@/components/ratings/CommunityTops";
import type { MediaCatalog } from "@/components/stream/MediaCatalogRails";
import { WikiImg } from "@/components/wiki/WikiImg";
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import type { CanonConfig } from "@/lib/canon-engine";
import type { CommunityTopsPayload } from "@/lib/community-tops";
import { HOME_TOPS_MIN_ENTRY_VOTES } from "@/lib/home-tops";
import type { FeedEntry } from "@/lib/feed";
import type { BestOfSagaView } from "@/lib/home-bestof";
import {
  DEFAULT_PLAY_CARDS,
  SECTION_DESTINATIONS,
  type HomeConfig,
  type HomeSectionConfig,
  type HomeSectionId,
} from "@/lib/home-scenes";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import { HomeCanonArbitre } from "./HomeCanonArbitre";
import { HOME_GAMES, HomeGames } from "./HomeGames";
import { HomeHero } from "./HomeHero";
import { DbsBeerusSpotlight } from "./DbsBeerusSpotlight";
import { HomeGuardians, HomeLivePanel, HomeLiveProvider, HomePantheon } from "./HomeLive";
import { HomeMenuJourney } from "./HomeMenuJourney";
import { HomeQuickAccess, QUICK_ACCESS } from "./HomeQuickAccess";
import { HomeSection } from "./HomeSection";
import { HomeSectionNavigation } from "./HomeSectionNavigation";
import { SagaBestOf } from "./SagaBestOf";
import { SectionScene } from "./SectionScene";
import type { FeaturedCharacter, SagaTeaser, WikiCounts } from "./types";
import type { BotStats, PersonaLive, PresenceState, TopMember } from "./useLiveBotState";

export interface HomeViewProps {
  config: HomeConfig;
  access: AccessSnapshot | null;
  stats: BotStats;
  personas: PersonaLive[];
  topMembers: TopMember[];
  topMembersAvailable: boolean;
  presence: PresenceState;
  wikiCounts: WikiCounts;
  characters: FeaturedCharacter[];
  sagas: SagaTeaser[];
  bestof: BestOfSagaView[];
  communityTops: CommunityTopsPayload | null;
  /** Fil unifié (`lib/feed`) : articles et discussions publiques. */
  feed: FeedEntry[];
  catalog: MediaCatalog | null;
  canon: { doctrine: CanonConfig; references: number };
}

/**
 * Top 3 boards for the home: the page loads them ranked among entries with at least three
 * votes (`getHomeCommunityTops`); a board left without podium is hidden, and with no board
 * left the block is hidden instead of rendering an empty podium. The entry floor is applied
 * here again so a payload from another source cannot bring a one-vote 5.0 back.
 */
export function homeCommunityTops(tops: CommunityTopsPayload | null): CommunityTopsPayload | null {
  if (!tops) return null;
  const boards = tops.boards
    .map((board) => ({
      ...board,
      entries: board.entries
        .filter((entry) => entry.count >= HOME_TOPS_MIN_ENTRY_VOTES)
        .map((entry, index) => Object.assign({}, entry, { rank: (index + 1) as 1 | 2 | 3 })),
    }))
    .filter((board) => board.entries.length > 0);
  return boards.length > 0 ? { ...tops, boards } : null;
}

/** Blocs dont la place est fixe dans la page (fonctions, pas contenus). */
const FIXED: ReadonlySet<string> = new Set(["universe", "news", "pantheon", "community"]);

/** Largeur d'un bloc éditorial sur la grille de douze colonnes. */
const SPAN: Record<string, string> = {
  bestof: "lg:col-span-12",
  tops: "lg:col-span-12",
  personnages: "lg:col-span-12",
  sagas: "lg:col-span-12",
  guardians: "lg:col-span-6",
  play: "lg:col-span-6",
};

const card =
  "rounded-xl border border-white/[0.08] bg-dbz-card/80 transition-colors hover:border-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange";

const navigationLabel = (s: HomeSectionConfig) => s.navLabel.trim() || s.title.trim();

const label = (s: HomeSectionConfig, fallback: string) =>
  s.title.trim() || s.navLabel.trim() || fallback;

/**
 * Destinations déjà ouvertes par un bloc de la page : « Explorer aussi » ne
 * les répète pas. Exporté pour les tests.
 */
export function coveredDestinations(config: HomeConfig, shown: ReadonlySet<string>): string[] {
  const covered = new Set<string>(QUICK_ACCESS.map((tile) => tile.href));
  covered.add("/wiki/search");
  // Bloc fixe des mini-jeux.
  covered.add("/games");
  for (const game of HOME_GAMES) covered.add(game.href);
  for (const section of config.sections) {
    if (!section.enabled || !shown.has(section.id)) continue;
    for (const href of SECTION_DESTINATIONS[section.id as HomeSectionId] ?? []) covered.add(href);
  }
  if (config.canon.enabled) covered.add("/wiki/canon");
  return [...covered];
}

export function HomeView(rawProps: HomeViewProps) {
  const props = { ...rawProps, communityTops: homeCommunityTops(rawProps.communityTops) };
  const { config, access, feed, bestof, communityTops } = props;
  const enabled = new Map(config.sections.filter((s) => s.enabled).map((s) => [s.id, s]));

  // Un bloc activé mais sans matière ne s'affiche pas (et ne couvre donc rien).
  const hasMatter = (s: HomeSectionConfig): boolean => {
    switch (s.id) {
      case "news":
        return feed.length > 0;
      case "bestof":
        return bestof.length > 0;
      case "tops":
        return communityTops != null;
      case "personnages":
        return props.characters.length > 0;
      case "sagas":
        return props.sagas.length > 0;
      case "guardians":
        return props.personas.length > 0;
      case "custom":
        return true;
      default:
        return true;
    }
  };
  const shown = new Set(config.sections.filter((s) => s.enabled && hasMatter(s)).map((s) => s.id));
  const flow = config.sections.filter((s) => shown.has(s.id) && !FIXED.has(s.id));

  const news = enabled.get("news");
  const pantheon = enabled.get("pantheon");
  const universe = enabled.get("universe");
  const tops = flow.findIndex((s) => s.id === "tops");
  const canonAt = tops >= 0 ? tops + 1 : flow.length;

  // Chaque bloc éditorial se pose sur son clip (`section.scene`), chargé à l'approche.
  const blocks = flow.map((s) => (
    <SectionScene key={s.id} scene={s.scene} className={SPAN[s.id] ?? "lg:col-span-12"}>
      <EditorialBlock section={s} {...props} className="" />
    </SectionScene>
  ));
  if (config.canon.enabled) {
    blocks.splice(
      canonAt,
      0,
      <HomeCanonArbitre
        key="canon"
        config={config.canon}
        doctrine={props.canon.doctrine}
        references={props.canon.references}
        className="lg:col-span-12"
      />,
    );
  }

  return (
    <HomeLiveProvider
      stats={props.stats}
      personas={props.personas}
      topMembers={props.topMembers}
      topMembersAvailable={props.topMembersAvailable}
      presence={props.presence}
    >
      <DbsBeerusSpotlight />
      <HomeHero hero={config.hero} />
      <PageShell width="wide" rhythm="tight">
        <HomeSectionNavigation
          sections={[
            { id: "universe", label: universe ? navigationLabel(universe) : "" },
            { id: "community", label: "" },
            ...(pantheon && shown.has("pantheon")
              ? [{ id: "pantheon", label: navigationLabel(pantheon) }]
              : []),
            ...flow
              .slice(0, canonAt)
              .map((section) => ({ id: section.id, label: navigationLabel(section) })),
            ...(config.canon.enabled ? [{ id: "canon", label: config.canon.title }] : []),
            ...flow
              .slice(canonAt)
              .map((section) => ({ id: section.id, label: navigationLabel(section) })),
            ...(news && shown.has("news")
              ? [{ id: "actualites", label: navigationLabel(news) }]
              : []),
          ]}
        />
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-12 lg:gap-y-10">
          <HomeQuickAccess
            counts={props.wikiCounts}
            access={access}
            title={universe ? universe.title : undefined}
            className="lg:col-span-12"
          />

          <ContinueRail wiki flush limit={16} className="min-w-0 lg:col-span-12" />

          <HomeLivePanel
            showCommunity={shown.has("community")}
            className={pantheon && shown.has("pantheon") ? "lg:col-span-8" : "lg:col-span-12"}
          />

          {pantheon && shown.has("pantheon") && (
            <HomePantheon title={label(pantheon, "")} className="lg:col-span-4" />
          )}

          {blocks}

          <HomeMenuJourney
            access={access}
            config={config.journey}
            covered={coveredDestinations(config, shown)}
            className="lg:col-span-12"
          />

          {/* Tout en bas, dans cet ordre : les dernières nouvelles, puis les mini-jeux. */}
          {news && shown.has("news") && (
            <HomeSection
              id="actualites"
              title={label(news, "") || <T k="home.news.index.title" />}
              subtitle={news.subtitle || undefined}
              moreHref="/news"
              moreLabel={<T k="home.news.all" />}
              className="lg:col-span-12"
            >
              <HomeNews entries={feed} />
            </HomeSection>
          )}

          <HomeGames className="lg:col-span-12" />
        </div>
      </PageShell>
    </HomeLiveProvider>
  );
}

/** Une manchette avec image, puis le fil en lignes. */
function HomeNews({ entries }: { entries: FeedEntry[] }) {
  const lead = entries.find((e) => e.kind === "article" && e.image) ?? null;
  const rest = entries.filter((e) => e !== lead).slice(0, lead ? 4 : 6);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {lead && <FeedLead entry={lead} />}
      {rest.length > 0 && (
        <div className={lead ? "" : "md:col-span-2"}>
          <FeedStream entries={rest} compact />
        </div>
      )}
    </div>
  );
}

/** Un bloc éditorial piloté par `/admin/home`. */
function EditorialBlock({
  section,
  className,
  access,
  bestof,
  catalog,
  communityTops,
  characters,
  sagas,
}: HomeViewProps & { section: HomeSectionConfig; className: string }) {
  const title = label(section, "");
  const subtitle = section.subtitle || undefined;

  if (section.isCustom) {
    const body = section.body?.trim();
    return (
      <HomeSection id={section.id} title={title} subtitle={subtitle} className={className}>
        {body ? (
          <div className="home-custom-body max-w-3xl leading-relaxed text-white/80">
            <WikiMarkdown body={body} />
          </div>
        ) : null}
      </HomeSection>
    );
  }

  switch (section.id) {
    case "bestof":
      return (
        <HomeSection id="bestof" title={title} subtitle={subtitle} className={className}>
          <SagaBestOf sagas={bestof} catalog={catalog} access={access} />
        </HomeSection>
      );
    case "tops":
      return communityTops ? (
        <HomeSection
          id="tops"
          title={title}
          subtitle={subtitle}
          moreHref="/rankings"
          moreLabel={<T k="accueil.more" />}
          className={className}
        >
          <CommunityTops data={communityTops} compact showHeader={false} />
        </HomeSection>
      ) : null;
    case "personnages":
      return (
        <HomeSection
          id="personnages"
          title={title}
          subtitle={subtitle}
          moreHref="/wiki/characters"
          moreLabel={<T k="home.characters.all" />}
          className={className}
        >
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {characters.map((c) => (
              <li key={c.id}>
                <ClientGatedWrap
                  access={access}
                  href={`/wiki/characters/${c.id}`}
                  className={`group relative block aspect-[3/4] overflow-hidden ${card}`}
                >
                  <WikiImg
                    src={c.image}
                    alt=""
                    sizes="(min-width: 1024px) 15vw, (min-width: 640px) 23vw, 31vw"
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-2 pb-2 pt-8">
                    <span className="block truncate font-display text-[0.8125rem] font-bold text-white">
                      {c.name}
                    </span>
                    {c.race && (
                      <span className="block truncate text-[0.6875rem] text-white/60">
                        {c.race}
                      </span>
                    )}
                  </span>
                </ClientGatedWrap>
              </li>
            ))}
          </ul>
        </HomeSection>
      );
    case "sagas":
      return (
        <HomeSection
          id="sagas"
          title={title}
          subtitle={subtitle}
          moreHref="/wiki/sagas"
          moreLabel={<T k="home.sagas.all" />}
          className={className}
        >
          <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            {sagas.map((s) => (
              <li key={s.id}>
                <ClientGatedWrap
                  access={access}
                  href={s.slug ? `/wiki/sagas/${s.slug}` : "/wiki/sagas"}
                  className={`group flex h-full flex-col gap-1 p-4 ${card}`}
                >
                  {s.series && <span className="text-xs text-white/55">{s.series}</span>}
                  <span className="font-display text-[0.9375rem] font-bold text-white transition-colors group-hover:text-dbz-gold">
                    {s.name}
                  </span>
                  {s.description && (
                    <span className="line-clamp-3 text-sm leading-snug text-white/60">
                      {s.description}
                    </span>
                  )}
                </ClientGatedWrap>
              </li>
            ))}
          </ul>
        </HomeSection>
      );
    case "guardians":
      return <HomeGuardians title={title} className={className} />;
    case "play":
      return (
        <HomeSection id="play" title={title} subtitle={subtitle} className={className}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(section.cards ?? DEFAULT_PLAY_CARDS)
              .filter((c) => c.href !== "/games")
              .map((c) => (
                <li key={c.href + c.title}>
                  <Link
                    href={c.href}
                    className={`group flex h-full min-h-16 flex-col justify-center p-4 ${card}`}
                  >
                    <span className="font-display text-[0.9375rem] font-bold text-white transition-colors group-hover:text-dbz-gold">
                      {c.title}
                    </span>
                    <span className="mt-0.5 text-sm text-white/60">{c.desc}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </HomeSection>
      );
    default:
      return null;
  }
}
