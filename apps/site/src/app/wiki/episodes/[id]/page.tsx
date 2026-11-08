import { readPlaybackCapabilities } from "@/lib/playback-capabilities";
/* oxlint-disable react/iframe-missing-sandbox -- legacy UI kept as-is (behavior-preserving lint pass) */
import { clampTitle } from "@/lib/seo-title";
import { WatchLayout, WatchStage, WatchColumns } from "@/components/episodes/WatchLayout";
import { T } from "@/components/T";
import { ArrowLeft, ArrowRight, Film } from "lucide-react";
import { HOME_HERO_FRAMES } from "@/lib/home-hero-frames";
import { EpisodeAirDate } from "@/components/episodes/EpisodeAirDate";
import detailStyles from "./episode-detail.module.css";
import { episodeNumberText } from "@/lib/episode-number";
import { hasEditorialDatabase } from "@/lib/prerender";
import { EntityParticipation } from "@/components/social/EntityParticipation";
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import { dbUniverse } from "@/lib/db-universe";
import type { EpisodeNavItem } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { ogMeta } from "@/lib/og";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
// Client Component : un RSC peut le rendre directement. `ssr:false` n'est pas
// autorisé via next/dynamic dans un Server Component (Next 16) → le no-SSR
// (hls.js touche `window`) est géré à l'intérieur du composant lui-même.
import { VideoPlayer } from "@/components/episodes/VideoPlayer";
import { EpisodeTimeline } from "@/components/episodes/EpisodeTimeline";
import { EpisodeAdminEditor } from "./EpisodeAdminEditor";
import { WikiEditBar } from "@/components/wiki/WikiEditBar";
import { VideoLecteurs } from "@/components/episodes/VideoLecteurs";
import { VideoSourceSummary } from "@/components/episodes/VideoSourceSummary";
import { VideoUnavailableCard } from "@/components/episodes/VideoUnavailableCard";
import { OffreLegale } from "@/components/episodes/OffreLegale";
import { AnimatedMedia } from "@/components/media/AnimatedMedia";
import { BackgroundImage } from "@/components/media/BackgroundImage";
import { EpisodeScenes } from "./EpisodeScenes";
import { isShenronEpisodeVideoURL } from "@/lib/episode-video-source";
import { episodePlayback } from "@/lib/episode-playback";
import { EntityRating, EntityRatingSummary } from "@/components/ratings/EntityRating";
import { CommunityRankBadge } from "@/components/ratings/CommunityRankBadge";
import { JsonLd } from "@/components/JsonLd";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TrackHistory } from "@/components/history/TrackHistory";
import { ShareButton } from "@/components/ShareButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { AdUnit } from "@/components/ads/AdUnit";
import type { TVEpisode, WithContext } from "schema-dts";
import { excerpt } from "../_text";
import { idDeFiche } from "../../_id-fiche";

export const dynamic = "force-dynamic";

// Playback capability is projected at request time; catalogue data keeps its own cache.
// Utilise `episodeIds()` pour ne transférer que les entiers d'identifiants sans charger
// les gros payloads JSONB (synopsis, players, frames) en mémoire de build.
export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const ids = await dbUniverse.episodeIds();
  return (ids ?? []).map((id) => ({ id: String(id) }));
}

const SERIES_LABELS: Record<string, string> = {
  DB: "Dragon Ball",
  DBZ: "Dragon Ball Z",
  DBZ_KAI: "Dragon Ball Z Kai",
  DBZ_KAI_FINAL: "Dragon Ball Z Kai – Final Chapters",
  DBGT: "Dragon Ball GT",
  DBS: "Dragon Ball Super",
  DBS_BEERUS: "Dragon Ball Super: Beerus",
  DB_DAIMA: "Dragon Ball Daima",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numero = idDeFiche(id);
  const ep = numero === null ? null : await dbUniverse.episode(numero);
  if (!ep) notFound();
  // Synopsis nettoyé (Markdown retiré) et tronqué ~160 car. pour meta/og :
  // certains synopsis contiennent du Markdown (*_#>) qui fuiterait sinon brut.
  const description =
    excerpt(ep.synopsis) ||
    (ep.number_in_series === null
      ? `${ep.title} — ${ep.series}`
      : `Fiche détaillée de l'épisode ${ep.number_in_series} de ${ep.series}.`);
  return {
    title: clampTitle(
      ep.number_in_series === null ? ep.title : `Épisode ${ep.number_in_series} : ${ep.title}`,
      ` — ${SERIES_LABELS[ep.series] ?? ep.series}`,
    ),
    description,
    ...ogMeta({
      title: `${ep.title} — ${SERIES_LABELS[ep.series] ?? ep.series}`,
      description,
      image: ep.image ? assetUrl(ep.image) : undefined,
      video: ep.video_url || ep.stream_url || undefined,
      type: "video.episode",
      canonical: `/wiki/episodes/${ep.id}`,
    }),
  };
}

function getYoutubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return m && m[2].length === 11 ? m[2] : null;
}

/** Carte de navigation épisode précédent / suivant. */
function NavCard({ ep, dir }: { ep: EpisodeNavItem; dir: "prev" | "next" }) {
  const image =
    HOME_HERO_FRAMES.find((frame) => frame.episodeId === ep.id)?.src ??
    (ep.image ? assetUrl(ep.image) : null);
  return (
    <Link href={`/wiki/episodes/${ep.id}`} className={detailStyles.navCard}>
      <div className={detailStyles.navImage}>
        {image ? (
          <img src={image} alt="" aria-hidden loading="lazy" />
        ) : (
          <div className={detailStyles.navPlaceholder}>
            {ep.number_in_series === null ? (
              <Film size={24} aria-hidden="true" />
            ) : (
              ep.number_in_series
            )}
          </div>
        )}
      </div>
      <div className={detailStyles.navText}>
        <p className={detailStyles.navDirection}>
          {dir === "prev" ? (
            <ArrowLeft size={15} aria-hidden="true" />
          ) : (
            <ArrowRight size={15} aria-hidden="true" />
          )}
          <T k={dir === "prev" ? "mediaPlayback.previousEpisode" : "mediaPlayback.nextEpisode"} />
          {ep.number_in_series}
        </p>
        <p className={detailStyles.navTitle}>{ep.title}</p>
      </div>
    </Link>
  );
}

export default async function EpisodeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numero = idDeFiche(id);
  const ep = numero === null ? null : await dbUniverse.episode(numero);
  if (!ep) notFound();

  const [nav, saga] = await Promise.all([
    dbUniverse.episodeNav(ep.series, ep.number_in_series),
    // Saga DÉRIVÉE des bornes (`db_sagas.episode_start/end`) : `arc_id` est nul
    // sur 790 épisodes sur 826, la base ne sait donc pas répondre directement.
    // Retourne null pour les 167 épisodes hors de toute borne — dans ce cas la
    // fiche ne dit rien plutôt que de rattacher au hasard.
    dbUniverse.episodeSaga(ep.series, ep.number_in_series),
  ]);

  const youtubeId = getYoutubeId(ep.video_url);
  const seriesLabel = SERIES_LABELS[ep.series] ?? ep.series;
  const epNum = episodeNumberText(ep.number_in_series, true);
  const episodeTitle =
    ep.number_in_series === null ? ep.title : `Épisode ${ep.number_in_series} : ${ep.title}`;
  const episodeCaption =
    ep.number_in_series === null
      ? `${seriesLabel} · ${ep.title}`
      : `${seriesLabel} · épisode ${ep.number_in_series}`;
  const capabilities = await readPlaybackCapabilities();
  const playback = episodePlayback(ep, capabilities);
  const cdnSource = [
    ep.video_url,
    ep.stream_url,
    ...(ep.players ?? []).map((entry) => entry.embedUrl),
  ].find((source): source is string => {
    if (!source || !URL.canParse(source)) return false;
    const url = new URL(source);
    return (
      isShenronEpisodeVideoURL(url) &&
      (url.pathname.includes(`/episodes/${ep.id}/`) ||
        (ep.id === 875 && url.pathname.includes("/episodes/beerus-01/")))
    );
  });

  // Episodes with a qualified Shenron CDN source play it exclusively.
  const cdnOnly = ep.id === 875 || ep.id === 876 || cdnSource !== undefined;

  // Priorité aux lecteurs voir-anime (VF/VOSTFR, sources réelles maintenues à
  // jour) : ils priment sur `video_url`/`stream_url` qui pouvaient contenir des
  // flux de test (mux.dev) ou des tokens HLS périmés (IP-bound, ~12 h).
  const player = cdnOnly ? (
    cdnSource ? (
      <VideoPlayer
        src={cdnSource}
        title={episodeTitle}
        episodeId={ep.id}
        poster={ep.image ? assetUrl(ep.image) : undefined}
        subtitles={ep.subtitles ?? undefined}
      />
    ) : null
  ) : playback.players.length > 0 ? (
    <VideoLecteurs
      players={playback.players}
      entityType="episode"
      entityId={ep.id}
      title={episodeTitle}
      poster={ep.image ? assetUrl(ep.image) : undefined}
      subtitles={ep.subtitles ?? undefined}
      // VO sous-titrée : variante VOSTFR (audio japonais) du proxy HLS, avec les
      // pistes de la fiche — les iframes tierces ne peuvent pas les afficher.
      vo={
        playback.voHlsMasterUrl && ep.subtitles?.length
          ? {
              src: playback.voHlsMasterUrl,
              title: episodeTitle,
              poster: ep.image ? assetUrl(ep.image) : undefined,
              subtitles: ep.subtitles,
            }
          : undefined
      }
    />
  ) : ep.video_url ? (
    <VideoPlayer
      src={ep.video_url}
      title={episodeTitle}
      poster={ep.image ? assetUrl(ep.image) : undefined}
      subtitles={ep.subtitles ?? undefined}
    />
  ) : playback.nativeSource ? (
    <VideoPlayer
      src={playback.nativeSource.src}
      title={episodeTitle}
      poster={ep.image ? assetUrl(ep.image) : undefined}
      subtitles={ep.subtitles ?? undefined}
    />
  ) : null;

  // === Scènes d'épisode (additif, dégradation gracieuse) ===
  // On ne garde que les frames réellement écrites (imagePath non null : un
  // dry-run du pipeline laisse `imagePath === null`).
  const frames = cdnOnly ? [] : (ep.frames ?? []).filter((f) => f.imagePath != null);
  const _hasFrames = frames.length > 0;
  // Première frame (poster du preview) + meilleure frame marquante (hero fallback).
  const firstFrame = frames[0] ?? null;
  const notableFrame = frames.find((f) => f.isNotable) ?? firstFrame;

  // Bloc « scène » mis en avant : MP4 preview animé > frame marquante en
  // ken-burns. N'apparaît que si on a un montage ou des frames — sinon null,
  // le comportement actuel de la page reste strictement inchangé.
  const sceneHero = cdnOnly ? null : ep.scene_preview ? (
    <AnimatedMedia
      src={assetUrl(ep.scene_preview)}
      poster={firstFrame?.imagePath ? assetUrl(firstFrame.imagePath) : undefined}
      alt={`Aperçu animé — ${ep.title}`}
      className="aspect-video w-full rounded-xl"
    />
  ) : notableFrame?.imagePath ? (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl">
      <BackgroundImage
        variant="kenburns"
        src={assetUrl(notableFrame.imagePath)}
        alt={`Scène marquante — ${ep.title}`}
        overlay="bottom"
      />
    </div>
  ) : null;

  const episodeSchema: WithContext<TVEpisode> = {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    ...(ep.number_in_series === null ? {} : { episodeNumber: String(ep.number_in_series) }),
    name: ep.title,
    description: excerpt(ep.synopsis) || undefined,
    image: ep.image ? assetUrl(ep.image) : undefined,
    partOfSeries: {
      "@type": "TVSeries",
      name: seriesLabel,
    },
    datePublished: ep.air_date ? new Date(ep.air_date * 1000).toISOString() : undefined,
    ...(ep.video_url || ep.stream_url
      ? {
          video: {
            "@type": "VideoObject" as const,
            name: ep.title,
            description: excerpt(ep.synopsis) || undefined,
            thumbnailUrl: ep.image ? assetUrl(ep.image) : undefined,
            contentUrl: ep.video_url || ep.stream_url,
            uploadDate: ep.air_date ? new Date(ep.air_date * 1000).toISOString() : undefined,
            duration: ep.duration_sec
              ? `PT${Math.floor(ep.duration_sec / 60)}M${ep.duration_sec % 60}S`
              : undefined,
          },
        }
      : {}),
  };

  return (
    <div className="relative">
      <JsonLd data={episodeSchema} />
      <WatchLayout series={ep.series}>
        {/* Fil d'Ariane : remplace l'ancien lien « ← <série> » isolé (qui ne
				    disait ni où l'on se trouve dans l'arborescence, ni comment remonter
				    plus haut) et porte en même temps le balisage `BreadcrumbList`. */}
        <TrackHistory
          kind="episode"
          id={ep.id}
          title={ep.title}
          href={`/wiki/episodes/${ep.id}`}
          image={ep.image}
          caption={episodeCaption}
        />
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Épisodes", href: "/wiki/episodes" },
            { label: seriesLabel, href: `/wiki/episodes/series/${ep.series}` },
            // La saga s'intercale quand les bornes la donnent : c'est le seul
            // chemin qui relie un épisode au récit dont il fait partie.
            ...(saga ? [{ label: saga.name, href: `/wiki/sagas/${saga.slug}` }] : []),
            { label: ep.number_in_series === null ? ep.title : `Épisode ${ep.number_in_series}` },
          ]}
        />
        <WatchStage>
          {/* === Player === */}
          {player && <div className="relative group/player">{player}</div>}
          {!player && (
            <VideoUnavailableCard
              title={ep.title}
              kind="episode"
              poster={ep.image ? assetUrl(ep.image) : undefined}
            />
          )}
        </WatchStage>
        <WikiEditBar table="db_episodes" id={ep.id} indexHref="/wiki/episodes" label={ep.title} />
        <WatchColumns
          aside={
            <>
              {!cdnOnly && (
                <VideoSourceSummary
                  players={ep.players ?? []}
                  offers={ep.availability}
                  subtitles={ep.subtitles?.length ?? 0}
                  frames={frames.length}
                />
              )}
              {nav && (nav.prev || nav.next) && (
                <nav className="grid gap-3">
                  {nav.prev && <NavCard ep={nav.prev} dir="prev" />}
                  {nav.next && <NavCard ep={nav.next} dir="next" />}
                </nav>
              )}
              {!cdnOnly &&
                (ep.players?.some((source) => source.embedUrl.trim()) ||
                ep.subtitles?.length ||
                ep.availability?.length ||
                sceneHero ? (
                  <>
                    <OffreLegale offres={ep.availability} />

                    {/* === Aperçu animé de scène (montage MP4 / frame marquante) ===
				    Affiché en complément du player s'il existe un montage ou des
				    frames. Si aucun player n'existe par ailleurs, ce bloc tient
				    lieu de visuel principal. */}
                    {sceneHero && <div className="rounded-xl overflow-hidden">{sceneHero}</div>}
                  </>
                ) : null)}
            </>
          }
        >
          {/* Title and metadata stay outside the viewing stage. */}
          <header className={detailStyles.heading}>
            <div className={detailStyles.kicker}>
              <span className={detailStyles.number}>
                {epNum === null ? <T k="mediaPlayback.numberUnverified" /> : `#${epNum}`}
              </span>
              <p>{seriesLabel}</p>
            </div>

            <h1 className={detailStyles.title}>{ep.title}</h1>

            {ep.title_ja && <p className={detailStyles.japanese}>{ep.title_ja}</p>}

            <div className={detailStyles.metadata}>
              {ep.air_date && <EpisodeAirDate seconds={ep.air_date} />}
              <div className="flex flex-wrap items-center gap-2">
                <EntityRatingSummary targetType="episode" targetId={ep.id} />
                <CommunityRankBadge kind="episode" targetId={ep.id} />
              </div>
            </div>
          </header>

          <div className={detailStyles.actions}>
            <FavoriteButton
              kind="episode"
              id={ep.id}
              title={ep.title}
              href={`/wiki/episodes/${ep.id}`}
              image={ep.image}
              caption={episodeCaption}
              className={detailStyles.action}
            />
            <ShareButton
              title={`${ep.title} — ${seriesLabel}`}
              text={episodeCaption}
              path={`/wiki/episodes/${ep.id}`}
              className={detailStyles.action}
            />
            {cdnOnly && cdnSource && (
              <a href="#episode-timeline" className={detailStyles.action}>
                <Film size={17} aria-hidden="true" />
                <T k="episodePage.timelineAction" />
              </a>
            )}
          </div>

          <EpisodeAdminEditor episodeId={ep.id} videoUrl={ep.video_url} subtitles={ep.subtitles} />

          {/* === Corps : synopsis + scènes + nav — notes tout en bas === */}
          <div className="space-y-12">
            {ep.synopsis && (
              <section className={detailStyles.synopsis}>
                <h2>
                  <T k="episodePage.synopsis" />
                </h2>
                <div className="prose prose-invert max-w-none wiki-content">
                  <WikiMarkdown body={ep.synopsis} />
                </div>
                {ep.official_source_url && (
                  <a
                    href={ep.official_source_url}
                    target="_blank"
                    rel="noreferrer"
                    className={detailStyles.source}
                  >
                    <T k="episodePage.officialSource" />
                  </a>
                )}
              </section>
            )}

            {/* === Scènes de l'épisode === */}
            {cdnOnly ? (
              cdnSource ? (
                <div id="episode-timeline" className={detailStyles.timeline}>
                  <EpisodeTimeline episodeId={ep.id} />
                </div>
              ) : null
            ) : (
              <EpisodeScenes
                frames={frames}
                title={ep.title}
                episodeNumber={ep.number_in_series}
                episodeId={ep.id}
                timelineAvailable={
                  ep.players?.some(
                    (entry) =>
                      URL.canParse(entry.embedUrl) &&
                      isShenronEpisodeVideoURL(new URL(entry.embedUrl)),
                  ) ?? false
                }
              />
            )}

            {!cdnOnly && youtubeId && (
              <section className="space-y-6 reveal-up">
                <div className="flex items-center gap-6">
                  <h2 className="font-display font-bold text-2xl text-white uppercase tracking-widest whitespace-nowrap">
                    Extrait vidéo
                  </h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-dbz-red/50 to-transparent" />
                </div>
                <div className="dbz-panel p-2 aspect-video bg-black overflow-hidden">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    title={`${ep.title} — extrait`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="rounded-lg"
                  />
                </div>
              </section>
            )}

            {/* === Strip des épisodes voisins === */}
            {nav && nav.around.length > 1 && (
              <section>
                <h2 className="font-display font-bold text-[12px] tracking-[0.3em] uppercase text-white/50 mb-4">
                  <T k="episodePage.inSeries" values={{ series: seriesLabel }} />
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 [scrollbar-width:thin]">
                  {nav.around.map((e) => {
                    const active = e.id === ep.id;
                    return (
                      <Link
                        key={e.id}
                        href={`/wiki/episodes/${e.id}`}
                        className={`group relative w-40 shrink-0 dbz-panel overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange focus-visible:ring-offset-2 focus-visible:ring-offset-black ${active ? "ring-2 ring-dbz-orange" : ""}`}
                      >
                        <div className="relative aspect-video bg-dbz-bg overflow-hidden">
                          {e.image ? (
                            <img
                              src={assetUrl(e.image)}
                              alt=""
                              aria-hidden
                              className="h-full w-full object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                              loading="lazy"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-zinc-700 font-saiyan text-sm">
                              {String(e.number_in_series).padStart(3, "0")}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                          <span className="absolute top-1 left-1 scouter-text text-[9px] text-dbz-orange bg-black/60 px-1.5 py-0.5">
                            #{String(e.number_in_series).padStart(3, "0")}
                          </span>
                        </div>
                        <p className="p-2 font-display font-semibold text-[10px] text-white leading-tight line-clamp-2 group-hover:text-dbz-orange transition-colors">
                          {e.title}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Bannière display en fin de fiche — après le lecteur, le synopsis et
					    la navigation d'épisodes, jamais collée aux contrôles de lecture
					    (les clics accidentels sont un motif de suspension AdSense). */}
            <AdUnit placement="display" className="my-4" />

            {/* Notes & avis — dernier bloc (commentaires en fin de page) */}
            <div className="reveal-up">
              <EntityRating
                targetType="episode"
                targetId={ep.id}
                signinCallback={`/wiki/episodes/${ep.id}`}
                label="cet épisode"
              />
            </div>
          </div>
        </WatchColumns>
      </WatchLayout>
      <EntityParticipation
        kind="wiki"
        table="db_episodes"
        id={ep.id}
        path={`/wiki/episodes/${ep.id}`}
        label={ep.title ?? undefined}
      />
    </div>
  );
}
