import Link from "next/link";
import { Suspense } from "react";
import IndexLoading from "./IndexLoading";
import { GatedWrap } from "@/components/GatedLink";
import { getShenronCharacterCards, getShenronMovies } from "@/lib/shenron";
import { dbUniverse } from "@/lib/db-universe";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { StreamRow } from "@/components/stream/StreamRow";
import { PosterCard } from "@/components/stream/PosterCard";
import { EpisodeCard } from "@/components/stream/EpisodeCard";
import { CharacterPosterCard } from "@/components/wiki/CharacterPosterCard";
import { RepriseLecture } from "@/components/wiki/RepriseLecture";
import { resolveWikiCategoryBlurb, WIKI_CATEGORIES } from "@/lib/wiki-categories";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { entryByKey, isPathPublic } from "@aphrody/shenron-config/wiki-launch";
import { pickBestImage } from "@/lib/image-variants";
import { ContentCoverage } from "@/components/wiki/ContentCoverage";
import type { Metadata } from "next";
import { T } from "@/components/T";
import { getPublicCorpusStats } from "@/lib/public-corpus-stats";
import { getPublishedCardCount } from "@/lib/card-catalog";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { WikiPortalText } from "@/components/wiki/WikiPortalText";
import { WikiDiscoveryCard } from "@/components/wiki/WikiDiscoveryCard";
import { WikiImg } from "@/components/wiki/WikiImg";
import { wikiVisualTopic } from "@/lib/wiki-visual-theme";
import { assetUrl } from "@/lib/assets";
import styles from "@/components/wiki/wiki-editorial.module.css";
import { SectionDivider } from "@aphrody/shenron-ui/vie/SectionDivider";
import { getWikiPortalMessages } from "@/lib/wiki-character-version-messages";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "L'univers Dragon Ball",
  description:
    "Le sommaire de l'encyclopédie : personnages, sagas, planètes, races, techniques, films, épisodes, manga et databooks.",
  alternates: { canonical: "/wiki" },
};

const nf = new Intl.NumberFormat("fr-FR");

/** Catalogue artwork, section identity and measured coverage share one portal. */
export default function WikiIndex() {
  return (
    <Suspense fallback={<IndexLoading />}>
      <WikiIndexContent />
    </Suspense>
  );
}

async function WikiIndexContent() {
  const [
    characters,
    movies,
    episodesData,
    counts,
    access,
    databookData,
    mangaCatalogData,
    mangaData,
    battlesData,
    locationsData,
    tournamentsData,
    soundtracksData,
    dragonsData,
    itemsData,
    corpusCounts,
    cardCatalogCards,
  ] = await Promise.all([
    getShenronCharacterCards(),
    getShenronMovies(),
    dbUniverse.episodes("DBZ", 12, 0),
    dbUniverse.counts(),
    getLaunchConfig(),
    dbUniverse.databooks(),
    dbUniverse.mangaCatalogVolumes(),
    dbUniverse.readableMangaChapters(),
    dbUniverse.battles(),
    dbUniverse.locations(),
    dbUniverse.tournaments(),
    dbUniverse.soundtracks(),
    dbUniverse.dragons(),
    dbUniverse.items(),
    getPublicCorpusStats(),
    getPublishedCardCount().catch(() => 0),
  ]);

  const p = getWikiPortalMessages("fr");

  const c: Record<string, number> = {
    ...((counts ?? {}) as Record<string, number>),
    cardCatalogCards,
  };
  const total = Object.entries(c)
    .filter(([k]) => k !== "news" && k !== "tools")
    .reduce((n, [, v]) => n + (v ?? 0), 0);

  // Rubriques dans l'ordre du registre partagé — la même liste que la barre de
  // navigation, donc jamais de rubrique visible d'un côté et absente de l'autre.
  // `seeAllHref` d'un rail est un lien comme un autre : il doit disparaître si
  // la rubrique est fermée, sinon le sommaire promet une page qui répond 307.
  // On résout le gating ici (`isPathPublic`), la page étant déjà serveur.
  const ouvert = (href: string) => isPathPublic(href, access);

  // Artwork stays attached to its catalogue record; no invented URL or unrelated fallback.
  const characterArt = characters.find((entry) => entry.image);
  const locationArt = locationsData?.find((entry) => entry.image);
  const itemArt = itemsData?.find((entry) => entry.image);
  const movieArt = movies.find((entry) => entry.poster);
  const episodeArt = episodesData?.episodes.find((entry) => entry.image);
  const mangaArt = mangaCatalogData?.volumes.find((entry) => entry.cover);
  const databookArt = databookData?.items.find((entry) => entry.cover);
  type CategoryArtwork = { image: string; alt: string };
  const art = (image: string | null | undefined, alt: string): CategoryArtwork | undefined =>
    image ? { image, alt } : undefined;
  const categoryArtwork: Record<string, CategoryArtwork | undefined> = {
    characters: art(characterArt?.image, characterArt?.name ?? ""),
    races: art(characterArt?.image, characterArt?.name ?? ""),
    transformations: art(characterArt?.image, characterArt?.name ?? ""),
    sagas: art(episodeArt?.image, episodeArt?.title ?? ""),
    "power-levels": art(characterArt?.image, characterArt?.name ?? ""),
    locations: art(locationArt?.image, locationArt?.name ?? ""),
    items: art(itemArt?.image, itemArt?.name ?? ""),
    movies: art(movieArt?.poster, movieArt?.title ?? ""),
    episodes: art(episodeArt?.image, episodeArt?.title ?? ""),
    manga: art(mangaArt?.cover, mangaArt?.title ?? ""),
    databooks: art(databookArt?.cover, databookArt?.title ?? ""),
  };

  // La phrase de situation vient du registre d'accès (`wiki-launch`), qui la
  // porte déjà pour le méga-menu : sans elle, le sommaire du wiki n'affichait
  // qu'un nom et un nombre, et une rubrique de 33 entrées ressemblait à une
  // rubrique de 1 300. Même traitement pour toutes, sans texte écrit deux fois.
  const rubriques = WIKI_CATEGORIES.map((cat) =>
    Object.assign({}, cat, {
      label: <T k={`wikiExplorer.categories.${cat.key}`} />,
      count: c[cat.countKey] ?? 0,
      blurb: resolveWikiCategoryBlurb(cat, entryByKey(cat.key)?.blurb),
      artwork: categoryArtwork[cat.key],
    }),
  );
  const encyclopedie = rubriques.filter((r) => r.group === "encyclopedia");
  const supports = rubriques.filter((r) => r.group === "media");

  const vedettes = characters
    .filter((ch) => ch.image)
    .slice(0, 18)
    .map((ch) =>
      Object.assign({}, ch, { image: pickBestImage([ch.image, ch.portraitXv2]) ?? ch.image }),
    );
  const films = movies.slice(0, 18);
  const episodes = episodesData?.episodes.slice(0, 12) ?? [];
  const databooks = databookData?.items ?? [];
  const databooksWithContent = databooks.filter(
    (book) =>
      Boolean(book.description?.trim()) ||
      book.pages.some((page) => Boolean(page.image?.trim() || page.text?.trim())),
  ).length;
  const volumes = mangaCatalogData?.volumes ?? [];
  const readableVolumeIds = new Set(
    (mangaData?.chapters ?? [])
      .map((chapter) => chapter.volume_id)
      .filter((id): id is number => id != null),
  );

  const battlesList = battlesData ?? [];
  const locationsList = locationsData ?? [];
  const tournamentsList = tournamentsData ?? [];
  const soundtracksList = soundtracksData ?? [];
  const dragonsList = dragonsData ?? [];
  const itemsList = itemsData ?? [];

  const quickLinks = [
    {
      href: "/wiki/search",
      badge: "⌘K",
      title: <WikiPortalText name="quickSearchTitle" />,
      desc: <WikiPortalText name="quickSearchDesc" />,
    },
    {
      href: "/wiki/canon",
      badge: "CANON",
      title: <WikiPortalText name="quickCanonTitle" />,
      desc: <WikiPortalText name="quickCanonDesc" />,
    },
    {
      href: "/wiki/timeline",
      badge: "AGE",
      title: <WikiPortalText name="quickTimelineTitle" />,
      desc: <WikiPortalText name="quickTimelineDesc" />,
    },
    {
      href: "/wiki/toriyama",
      badge: "AUTHOR",
      title: <WikiPortalText name="quickToriyamaTitle" />,
      desc: <WikiPortalText name="quickToriyamaDesc" />,
    },
    {
      href: "/wiki/random",
      badge: "RNG",
      title: <WikiPortalText name="quickRandomTitle" />,
      desc: <WikiPortalText name="quickRandomDesc" />,
    },
    {
      href: "/wiki/contribute",
      badge: "EDIT",
      title: <WikiPortalText name="quickContributeTitle" />,
      desc: <WikiPortalText name="quickContributeDesc" />,
    },
  ];

  const pillars = [
    {
      href: "/wiki/canon",
      badge: <WikiPortalText name="pillarCanonBadge" />,
      title: <WikiPortalText name="pillarCanonTitle" />,
      desc: <WikiPortalText name="pillarCanonDesc" />,
    },
    {
      href: "/wiki/power-levels",
      badge: <WikiPortalText name="pillarPowerBadge" />,
      title: <WikiPortalText name="pillarPowerTitle" />,
      desc: <WikiPortalText name="pillarPowerDesc" />,
    },
    {
      href: "/wiki/toriyama",
      badge: <WikiPortalText name="pillarToriyamaBadge" />,
      title: <WikiPortalText name="pillarToriyamaTitle" />,
      desc: <WikiPortalText name="pillarToriyamaDesc" />,
    },
    {
      href: "/wiki/staff",
      badge: <WikiPortalText name="pillarStaffBadge" />,
      title: <WikiPortalText name="pillarStaffTitle" />,
      desc: <WikiPortalText name="pillarStaffDesc" />,
    },
  ];

  return (
    <WikiIndexPage
      eyebrow={<WikiPortalText name="eyebrow" />}
      title={<WikiPortalText name="title" />}
      lead={<WikiPortalText name="lead" values={{ total: nf.format(total) }} />}
      image={episodeArt?.image ?? undefined}
      imageAlt={episodeArt?.title}
      crumbs={[{ label: p("title"), display: <WikiPortalText name="title" /> }]}
    >
      <nav aria-label={p("quickAccessLabel")} className={styles.quickNav}>
        {quickLinks.map((item) => (
          <GatedWrap key={item.href} href={item.href} className={styles.quickLink}>
            <span>{item.title}</span>
            <ArrowUpRight aria-hidden="true" size={16} />
          </GatedWrap>
        ))}
      </nav>

      {/* Avant les rubriques : quelqu'un qui revient cherche d'abord où il
				    s'était arrêté. L'îlot ne rend rien s'il n'a rien à proposer. */}
      <RepriseLecture />
      <Rubriques
        titre={<WikiPortalText name="sectionUniverse" />}
        items={encyclopedie}
        entriesUnit={<WikiPortalText name="entriesUnit" />}
      />
      <SectionDivider className="my-0" />
      <Rubriques
        titre={<WikiPortalText name="sectionMedia" />}
        items={supports}
        entriesUnit={<WikiPortalText name="entriesUnit" />}
      />
      <SectionDivider className="my-0" />

      {/* Dossiers & Piliers Éditoriaux */}
      <section aria-labelledby="wiki-pillars-heading" className="space-y-4">
        <div>
          <h2
            id="wiki-pillars-heading"
            className="font-scouter text-[11px] uppercase tracking-[0.18em] text-dbz-orange"
          >
            {<WikiPortalText name="pillarsHeading" />}
          </h2>
          <p className="mt-1 text-sm text-white/55">{<WikiPortalText name="pillarsSubtitle" />}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar) => (
            <GatedWrap
              key={pillar.href}
              href={pillar.href}
              className="vie-glow group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-white/[0.09] bg-dbz-card/85 p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-dbz-orange/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange/60"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-dbz-orange/70 via-dbz-yellow/40 to-transparent opacity-75 transition-opacity group-hover:opacity-100"
              />
              <div>
                <span className="inline-block rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-dbz-orange">
                  {pillar.badge}
                </span>
                <h3 className="mt-3 font-display text-[15px] font-bold text-white transition-colors group-hover:text-dbz-orange">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-white/60">{pillar.desc}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] font-semibold text-white/55 group-hover:text-dbz-orange">
                <span>{<WikiPortalText name="openSection" />}</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </div>
            </GatedWrap>
          ))}
        </div>
      </section>

      <ContentCoverage
        databooks={{
          label: "Databooks & interviews",
          availableHref: "/wiki/databooks?state=available",
          missingHref: "/wiki/databooks?state=incomplete",
          available: databooksWithContent,
          total: databooks.length,
          unit: "ouvrages",
        }}
        manga={{
          label: "Manga",
          availableHref: "/wiki/manga?state=available",
          missingHref: "/wiki/manga?state=incomplete",
          available: readableVolumeIds.size,
          total: volumes.length,
          unit: "tomes",
        }}
        canon={{
          label: <T k="corpusStats.metrics.canonReferences" />,
          availableHref: "/wiki/canon",
          available: corpusCounts.canonReferences,
          total: null,
          unit: <T k="corpusStats.references" />,
          badge: <T k="corpusStats.indexedRecords" />,
          referenceOnly: true,
        }}
        rag={{
          label: <T k="corpusStats.metrics.ragChunks" />,
          availableHref: "/wiki/search",
          available: corpusCounts.ragChunks,
          total: null,
          unit: <T k="corpusStats.references" />,
          badge: <T k="corpusStats.indexedRecords" />,
          referenceOnly: true,
        }}
      />

      {vedettes.length > 0 && (
        <StreamRow
          title="Personnages"
          count={c.characters}
          seeAllHref={ouvert("/wiki/characters") ? "/wiki/characters" : undefined}
        >
          {vedettes.map((ch) => (
            <CharacterPosterCard
              key={ch.id}
              href={`/wiki/characters/${ch.id}`}
              name={ch.name}
              race={ch.race}
              image={ch.image}
            />
          ))}
        </StreamRow>
      )}

      {battlesList.length > 0 && (
        <StreamRow
          title="Combats Légendaires"
          count={c.battles}
          seeAllHref={ouvert("/wiki/events") ? "/wiki/events" : undefined}
        >
          {battlesList.slice(0, 10).map((b) => (
            <WikiDiscoveryCard
              key={b.slug}
              href={`/wiki/events?type=battles#event-battle-${b.slug}`}
              title={b.title}
              subtitle={b.title_ja}
              description={b.climax_summary}
              category="events"
              meta={[b.series, b.location].filter(Boolean).join(" · ")}
              detail={
                <>
                  <WikiPortalText name="winnerLabel" />{" "}
                  {b.winner_name || <WikiPortalText name="drawLabel" />}
                </>
              }
            />
          ))}
        </StreamRow>
      )}

      {locationsList.length > 0 && (
        <StreamRow
          title="Lieux & Sanctuaires"
          count={c.locations}
          seeAllHref={ouvert("/wiki/locations") ? "/wiki/locations" : undefined}
        >
          {locationsList.slice(0, 10).map((loc) => (
            <WikiDiscoveryCard
              key={loc.slug}
              href={`/wiki/locations/${loc.slug}`}
              title={loc.name}
              subtitle={loc.name_ja}
              description={loc.description}
              image={loc.image}
              category="locations"
              meta={[loc.realm_type, loc.planet].filter(Boolean).join(" · ")}
              detail={<T k="wiki.index.exploreSanctuary" />}
            />
          ))}
        </StreamRow>
      )}

      {tournamentsList.length > 0 && (
        <StreamRow
          title="Tournois d'Arts Martiaux"
          count={c.tournaments}
          seeAllHref={ouvert("/wiki/events") ? "/wiki/events" : undefined}
        >
          {tournamentsList.slice(0, 6).map((t) => (
            <WikiDiscoveryCard
              key={t.slug}
              href={`/wiki/events?type=tournaments#event-tournament-${t.slug}`}
              title={t.name}
              subtitle={t.name_ja}
              description={t.rules_summary}
              category="events"
              meta={[t.tournament_type, t.saga].filter(Boolean).join(" · ")}
              detail={<WikiPortalText name="bracketsAndMatches" />}
            />
          ))}
        </StreamRow>
      )}

      {dragonsList.length > 0 && (
        <StreamRow
          title="Dragons Sacrés & Vœux"
          count={c.dragons}
          seeAllHref={
            ouvert("/wiki/characters") ? "/wiki/characters#dragons-personnages" : undefined
          }
        >
          {dragonsList.map((d) => (
            <WikiDiscoveryCard
              key={d.slug}
              href={`/wiki/characters#dragon-${d.slug}`}
              title={d.name}
              description={d.summon_phrase}
              image={d.image}
              category="dragons"
              meta={<WikiPortalText name="ballsCount" values={{ count: d.balls_count }} />}
              detail={<WikiPortalText name="wishesAndRules" />}
            />
          ))}
        </StreamRow>
      )}

      {itemsList.length > 0 && (
        <StreamRow
          title="Objets & Technologies"
          count={c.items}
          seeAllHref={ouvert("/wiki/items") ? "/wiki/items" : undefined}
        >
          {itemsList.slice(0, 8).map((it) => (
            <WikiDiscoveryCard
              key={it.slug}
              href={`/wiki/items/${it.slug}`}
              title={it.name}
              subtitle={it.name_ja}
              description={it.description}
              image={it.image}
              category="items"
              meta={it.creator}
              detail={<T k="wiki.index.properties" />}
            />
          ))}
        </StreamRow>
      )}

      {soundtracksList.length > 0 && (
        <StreamRow
          title="Musiques & Bandes Originales"
          count={c.soundtracks}
          seeAllHref={ouvert("/wiki/music") ? "/wiki/music" : undefined}
        >
          {soundtracksList.slice(0, 8).map((ost) => (
            <WikiDiscoveryCard
              key={ost.slug}
              href={`/wiki/music#${ost.slug}`}
              title={ost.title}
              subtitle={ost.title_ja}
              description={ost.description}
              category="music"
              meta={[ost.series, ost.artist, ost.release_year].filter(Boolean).join(" · ")}
              detail={<WikiPortalText name="listenAndAnalyze" />}
            />
          ))}
        </StreamRow>
      )}

      {films.length > 0 && (
        <StreamRow
          title="Films"
          count={c.movies}
          seeAllHref={ouvert("/wiki/movies") ? "/wiki/movies" : undefined}
        >
          {films.map((m) => (
            <PosterCard
              key={m.id}
              href={`/wiki/movies/${m.slug}`}
              title={m.title}
              poster={m.poster}
              badge="Film"
            />
          ))}
        </StreamRow>
      )}

      {episodes.length > 0 && (
        <StreamRow
          title="Épisodes"
          count={c.episodes}
          seeAllHref={ouvert("/wiki/episodes") ? "/wiki/episodes" : undefined}
        >
          {episodes.map((ep) => (
            <EpisodeCard
              key={ep.id}
              href={`/wiki/episodes/${ep.id}`}
              number={ep.number_in_series}
              title={ep.title}
              image={ep.image}
            />
          ))}
        </StreamRow>
      )}

      <section className="rounded-xl border border-white/[0.08] p-8 lg:p-10">
        <h2 className="font-title text-[26px] text-white">
          {<WikiPortalText name="unfinishedTitle" />}
        </h2>
        {/* Le circuit interne (« vous modifiez le texte, un relecteur publie,
					    la modification garde votre nom ») a été retiré le 2026-09-12 : ce
					    qu'un lecteur a besoin de savoir, c'est d'où vient le contenu et où
					    cliquer. */}
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/60">
          {<WikiPortalText name="unfinishedBody" />}
        </p>
        <Link
          href="/wiki/contribute"
          className="mt-6 inline-flex h-11 items-center rounded-full border border-white/15 px-6 font-display text-[14px] font-semibold text-white transition-colors hover:border-dbz-orange/60 hover:text-dbz-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange/60"
        >
          {<WikiPortalText name="unfinishedCta" />}
        </Link>
      </section>
    </WikiIndexPage>
  );
}

/**
 * Grille de rubriques : nom, volume mesuré, et ce que la rubrique contient.
 *
 * La version précédente alignait des cellules « nom + nombre » séparées par un
 * filet d'un pixel. Deux défauts : aucune rubrique ne disait ce qu'on y trouve
 * (un lecteur ne devine pas ce que « Cosmologie » recouvre), et la grille ne
 * partageait rien avec le reste du site — ni cadre d'encre, ni ombre portée,
 * alors que chaque carte du wiki en a un. Une cellule = une case de manga, avec
 * le même cadre et le même mouvement au survol que partout ailleurs.
 */
function Rubriques({
  titre,
  items,
}: {
  titre: ReactNode;
  items: Array<{
    key: string;
    label: ReactNode;
    href: string;
    count: number;
    blurb: string | null;
    artwork?: { image: string; alt: string };
  }>;
  entriesUnit?: ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-5 font-display text-2xl font-bold text-foreground">{titre}</h2>
      <div className={styles.topicGrid}>
        {items.map((r) => (
          <GatedWrap
            key={r.key}
            href={r.href}
            className={styles.topicCard}
            style={
              { "--wiki-accent": `var(--wiki-${wikiVisualTopic(r.key)})` } as React.CSSProperties
            }
          >
            {r.artwork && (
              <span className={styles.topicMedia}>
                <WikiImg
                  src={assetUrl(r.artwork.image)}
                  alt={r.artwork.alt}
                  sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 100vw"
                />
              </span>
            )}
            <span className={styles.topicContent}>
              <span className={styles.topicHeading}>
                <span>{r.label}</span>
                {r.count > 0 && <span className={styles.topicCount}>{nf.format(r.count)}</span>}
              </span>
              {r.blurb && <span className={styles.topicBlurb}>{r.blurb}</span>}
              <ArrowUpRight className={styles.topicArrow} aria-hidden="true" size={20} />
            </span>
          </GatedWrap>
        ))}
      </div>
    </section>
  );
}
